"use client";
import { useEffect, useRef, useState } from "react";
import { initModel, buildInput, predict } from "@/lib/onnx";
import { makeRolling } from "@/lib/rolling";
import useSound from 'use-sound';
import MqttClient from "../mqttclient.js";
import Navbar from "./components/navbar.js";

const LABELS = ["ปกติ", "เสี่ยงดินทรุด", "ดินทรุด"];
const BASE = ["Soil", "Temp", "humid", "pressure", "x", "y", "z"];
const SENSOR_NAMES = {
  sensor001: "เซนเซอร์หลัก (Main Sensor)",
  sensor002: "ริมถนน (Roadside Sensor)",
  sensor003: "หลังโรงเรียน (Behind School)",
};
export default function Home() {
  // sounds
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioOn = useRef(false);
  const audioUnlocked = useRef(false);

  const [playReady] = useSound("/sound/ready_alert.m4a", { volume: 0.8, interrupt: true });
  const [playWarn, { stop: stopWarn }] = useSound("/sound/yellow_alert.m4a", { volume: 0.8, interrupt: true });
  const [playDanger, { stop: stopDanger }] = useSound("/sound/red_alert.m4a", { volume: 0.9, interrupt: true });
  const [playNormal, { stop: stopNormal }] = useSound("/sound/green_alert.m4a", { volume: 0.6, interrupt: true });

  const handleToggleAudio = (enabled) => {
    setAudioEnabled(enabled);
    if (enabled) {
      audioOn.current = true;
      audioUnlocked.current = true;   // unlock after a user gesture
      playReady();
    } else {
      audioOn.current = false;
      stopWarn?.(); stopDanger?.(); stopNormal?.();
    }
  };
  const [sensorName, setSensorName] = useState("");

  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const ready = useRef(false);
  const featureOrder = useRef([]);
  const inferBusy = useRef(false);

  // hysteresis
  const streak = useRef(0);
  const lastLabel = useRef(null);

  // TTS
  const ttsOn = useRef(false);
  const ttsVoice = useRef(null);
  const voicesReady = useRef(false);
  const warmed = useRef(false);
  const prevPred = useRef(null); // พูดเฉพาะเมื่อ pred เปลี่ยน
  const [toggle, setToggle] = useState(false);

  useEffect(() => {
    // const readyToUse = new Audio('/sound/ready_alert.mp3');
    const pick = () => {
      const vs = window.speechSynthesis?.getVoices?.() || [];
      ttsVoice.current =
        vs.find(v => v.lang?.toLowerCase().startsWith("th")) ||
        vs.find(v => v.lang?.toLowerCase().startsWith("en")) ||
        vs[0] || null;
      voicesReady.current = !!ttsVoice.current;
    };
    pick();
    window.speechSynthesis?.addEventListener?.("voiceschanged", pick);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", pick);
  }, []);
  useEffect(() => {
    initModel()
      .then(({ featureOrder: fo }) => { featureOrder.current = fo; ready.current = true; })
      .catch(err => console.error("โหลดโมเดลล้มเหลว:", err));
  }, []);

  function summarize(prob) {
    const i = prob.reduce((b, _, k, a) => a[k] > a[b] ? k : b, 0);
    const p = prob[i];
    let level = "ไม่ชัดเจน", action = "ติดตามต่อ";
    if (p >= 0.8) { level = "สูง"; action = "เตือนทันที"; }
    else if (p >= 0.6) { level = "กลาง"; action = "เฝ้าระวัง"; }
    return { label: LABELS[i], i, p, level, action };
  }

  function decide(prob) {
    const s = summarize(prob);
    streak.current = (s.label === lastLabel.current) ? streak.current + 1 : 1;
    lastLabel.current = s.label;
    const fireAlarm = (s.label === "ดินทรุด" && s.p >= 0.65 && streak.current >= 3);
    return { ...s, streak: streak.current, fireAlarm };
  }

  async function onSensorTick(sensorId, raw) {
    if (!ready.current) return;

    const norm = {
      Soil: Number(raw.Soil ?? raw.soil),
      Temp: Number(raw.Temp ?? raw.temp),
      humid: Number(raw.humid ?? raw.hum),
      pressure: Number(raw.pressure ?? raw.pres),
      x: Number(raw.x),
      y: Number(raw.y),
      z: Number(raw.z),
    };


    const feat = makeRolling(sensorId, norm, BASE);
    if (!feat) return;

    if (inferBusy.current) return;
    inferBusy.current = true;
    try {
      const vec = buildInput(feat, featureOrder.current);
      const { pred, prob } = await predict(vec, featureOrder.current.length);
      setResult({ pred, prob });
      setSummary(decide(prob));

      // พูดเฉพาะเมื่อผลลัพธ์เปลี่ยน
      if (pred !== prevPred.current) {
        const name = LABELS[pred];

        if (audioOn.current && audioUnlocked.current) {
          if (name === "ดินทรุด") playDanger();
          else if (name === "เสี่ยงดินทรุด") playWarn();
          else if (name === "ปกติ") playNormal();
        }

        prevPred.current = pred;
      }


    } catch (e) {
      console.error(e);
    } finally {
      inferBusy.current = false;
    }
  }

  // async function simulate() {
  //   const base = { Soil: 2752, Temp: 27.4, humid: 78.6, pressure: 1011.9, x: 100, y: 88, z: 175 };
  //   for (let i = 0; i < 12; i++) {
  //     const raw = {
  //       Soil: base.Soil + (Math.random() - 0.5) * 5,
  //       Temp: base.Temp + (Math.random() - 0.5) * 0.2,
  //       humid: base.humid + (Math.random() - 0.5) * 0.3,
  //       pressure: base.pressure + (Math.random() - 0.5) * 0.5,
  //       x: base.x + (Math.random() - 0.5) * 1,
  //       y: base.y + (Math.random() - 0.5) * 1,
  //       z: base.z + (Math.random() - 0.5) * 1,
  //     };
  //     await onSensorTick("sensor001", raw);
  //     await new Promise(r => setTimeout(r, 5));
  //   }
  // }

  return (
    <>

      <Navbar audioEnabled={audioEnabled} onToggle={handleToggleAudio} />
      <div className="min-h-screen bg-gray-300 flex flex-col items-center p-8 text-gray-800">

        {/* Header */}
        {/* <div className="w-full flex items-center justify-center mb-10">
          <h1 className="text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">
            SENSOR STATUS DASHBOARD
          </h1>
        </div> */}

        {/* MQTT Component */}
        <div className="w-full max-w-2xl mb-8 p-6 bg-white/20 backdrop-blur-md rounded-2xl shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <div className="flex items-center justify-between mb-3">

            <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-blue-600 animate-pulse"
                viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.5 10a7.5 7.5 0 0115 0 7.5 7.5 0 01-15 0z" />
                <path fillRule="evenodd"
                  d="M10 3.75a6.25 6.25 0 100 12.5 6.25 6.25 0 000-12.5zM9 7h2v4H9V7zm0 5h2v1H9v-1z"
                  clipRule="evenodd" />
              </svg>
              MQTT
            </h2>
          </div>

          <MqttClient
            sub="sensor/landslide/data/+"
            onData={(topic, obj) => {
              const sensorId = "sensor001";
              setSensorName(SENSOR_NAMES[sensorId] || sensorId);
              onSensorTick(sensorId, {
                Soil: Number(obj.Soil ?? obj.soil),
                Temp: Number(obj.Temp ?? obj.temp),
                humid: Number(obj.humid ?? obj.hum),
                pressure: Number(obj.pressure ?? obj.pres),
                x: Number(obj.x),
                y: Number(obj.y),
                z: Number(obj.z),
              });
            }}
          />
        </div>

        {/* Controls */}


        <div className="bg-white/20 rounded-2xl h-auto w-full shadow-xl max-w-2xl p-4 flex flex-col gap-5  justify-center backdrop-blur-md  hover:shadow-2xl transition-shadow duration-300">
          {sensorName && (
            <div className="text-xl font-semibold text-white mb-4">
              <span className="text-black">{sensorName}</span>
            </div>
          )}

          {/* Condition Cards */}
          {result && (
            <div className="w-full max-w-2xl space-y-6">
              {LABELS[result.pred] === "ดินทรุด" && (
                // playDanger(),
                <div className="bg-white rounded-2xl shadow-lg border border-red-100 overflow-hidden transform hover:scale-[1.03] transition-all duration-300">
                  <div className="bg-gradient-to-r from-[#6B0A1C] to-[#E9163C] text-white text-center py-3 text-2xl font-bold tracking-widest">
                    DANGEROUS
                  </div>
                  <div className="flex items-center justify-center gap-4 p-6">
                    <img src="./assets/img/alert-bell.svg" alt="dangerous_pic" className="w-[80px] h-[80px] animate-bounce" />
                    <div className="text-xl font-semibold text-gray-800">
                      อันตราย!<br />ดินทรุดตัว
                    </div>
                  </div>
                </div>
              )}

              {LABELS[result.pred] === "เสี่ยงดินทรุด" && (
                // playWar(),
                <div className="bg-white rounded-2xl shadow-lg border border-yellow-100 overflow-hidden transform hover:scale-[1.03] transition-all duration-300">
                  <div className="bg-gradient-to-r from-[#f2a600] to-[#ffcc32] text-white text-center py-3 text-2xl font-bold tracking-widest">
                    WARNING
                  </div>
                  <div className="flex items-center justify-center gap-4 p-6">
                    <img src="./assets/img/warning.svg" alt="warning_pic" className="w-[80px] h-[80px] animate-pulse" />
                    <div className="text-xl font-semibold text-gray-800">
                      โปรดระวัง!<br />ดินทรุดตัว
                    </div>
                  </div>
                </div>
              )}

              {LABELS[result.pred] === "ปกติ" && (
                <div className="bg-white rounded-2xl shadow-lg border border-green-100 overflow-hidden transform hover:scale-[1.03] transition-all duration-300">
                  <div className="bg-gradient-to-r from-[#1C6016] to-[#32AA27] text-white text-center py-3 text-2xl font-bold tracking-widest">
                    NORMAL
                  </div>
                  <div className="flex items-center justify-center gap-4 p-6">
                    <img src="./assets/img/green-leaf.svg" alt="normal_pic" className="w-[80px] h-[80px]" />
                    <div className="text-xl font-semibold text-gray-800">
                      สภาวะปกติ
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Result Summary */}
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl w-full max-w-2xl hover:shadow-2xl transition duration-300">
            {result ? (
              <>
                <div className="text-2xl font-bold text-gray-800 mb-2">
                  ผลลัพธ์:
                  <span
                    className={`ml-2 ${LABELS[result.pred] === "ดินทรุด"
                      ? "text-red-600"
                      : LABELS[result.pred] === "เสี่ยงดินทรุด"
                        ? "text-yellow-600"
                        : LABELS[result.pred] === "ปกติ"
                          ? "text-green-600"
                          : ""
                      }`}
                  >
                    {LABELS[result.pred]}
                  </span>
                </div>

                <div className="text-gray-600 text-lg mb-3">
                  ความน่าจะเป็น: {result.prob.map(v => v.toFixed(3)).join(", ")}
                </div>

                {summary && (
                  <div className="mt-3 bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100 text-lg">
                    <div>
                      <strong className="text-gray-800">สรุป:</strong> {summary.label} |
                      <span className="ml-1">ระดับ: {summary.level}</span> |
                      <span className="ml-1 text-blue-600 font-semibold">
                        ความเชื่อมั่น: {(summary.p * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      ฮิสเทอรีซิส: {summary.streak} เฟรมต่อเนื่อง |
                      <span className="ml-1">การกระทำ: {summary.action}</span>
                    </div>
                    <div>
                      สั่งเตือนจริง:
                      <span
                        className={`ml-1 font-bold ${summary.fireAlarm
                          ? "text-red-500 animate-pulse"
                          : "text-gray-500"
                          }`}
                      >
                        {summary.fireAlarm ? "ใช่" : "ไม่ใช่"}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-400 italic text-center py-8 text-lg">
                กรุณารอรับข้อมูลจากเซนเซอร์...
              </div>
            )}
          </div>
        </div>

      </div>

    </>
  );
}
