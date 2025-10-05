"use client";
import { useEffect, useRef, useState } from "react";
import { initModel, buildInput, predict } from "@/lib/onnx";
import { makeRolling } from "@/lib/rolling";
import MqttClient from "../mqttclient.js";
import Navbar from "./components/navbar.js";

const LABELS = ["ปกติ", "เสี่ยงดินทรุด", "ดินทรุด"];
const BASE = ["Soil", "Temp", "humid", "pressure", "x", "y", "z"];

export default function Home() {
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

  useEffect(() => {
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

  function warmOnce() {
    if (warmed.current || !ttsOn.current || !voicesReady.current) return;
    const u = new SpeechSynthesisUtterance("พร้อมใช้งาน");
    if (ttsVoice.current) u.voice = ttsVoice.current;
    u.lang = ttsVoice.current?.lang || "th-TH";
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
    warmed.current = true;
  }

  function speakResult(pred) {
    if (!ttsOn.current || !voicesReady.current) return;
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    const u = new SpeechSynthesisUtterance(`ผลลัพธ์ ${LABELS[pred]}`);
    if (ttsVoice.current) u.voice = ttsVoice.current;
    u.lang = ttsVoice.current?.lang || "th-TH";
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
  }

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
        speakResult(pred);
        prevPred.current = pred;
      }
    } catch (e) {
      console.error(e);
    } finally {
      inferBusy.current = false;
    }
  }

  async function simulate() {
    const base = { Soil: 2752, Temp: 27.4, humid: 78.6, pressure: 1011.9, x: 100, y: 88, z: 175 };
    for (let i = 0; i < 12; i++) {
      const raw = {
        Soil: base.Soil + (Math.random() - 0.5) * 5,
        Temp: base.Temp + (Math.random() - 0.5) * 0.2,
        humid: base.humid + (Math.random() - 0.5) * 0.3,
        pressure: base.pressure + (Math.random() - 0.5) * 0.5,
        x: base.x + (Math.random() - 0.5) * 1,
        y: base.y + (Math.random() - 0.5) * 1,
        z: base.z + (Math.random() - 0.5) * 1,
      };
      await onSensorTick("sensor001", raw);
      await new Promise(r => setTimeout(r, 5));
    }
  }

  return (
    <>

      <Navbar />
      <div className="min-h-screen bg-gradient-to-b from-[#F9FAFB] to-[#EEF1F6] flex flex-col items-center p-8 text-gray-800 font-sans">
        {/* Header */}
        <h1 className="text-4xl font-extrabold text-blue-700 mb-6 tracking-tight">
          SENSOR STATUS
        </h1>

        {/* MQTT Component */}
        <div className="w-full max-w-2xl mb-6">
          <MqttClient
            sub="sensor/landslide/data"
            onData={(topic, obj) => {
              // map Arduino keys -> model keys and call onSensorTick
              onSensorTick("sensor001", {
                Soil: Number(obj.Soil ?? obj.soil),
                Temp: Number(obj.Temp ?? obj.temp),
                humid: Number(obj.humid ?? obj.hum),       // accept "hum"
                pressure: Number(obj.pressure ?? obj.pres),// accept "pres"
                x: Number(obj.x),
                y: Number(obj.y),
                z: Number(obj.z),
              });
            }}
          />


        </div>

        {/* Controls */}
        <div className="flex items-center gap-5 mb-8">
          <button
            onClick={simulate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-300"
          >
            ▶️ Simulate 12 Ticks
          </button>

          <label className="flex items-center gap-2 text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              onChange={e => {
                ttsOn.current = e.target.checked;
                if (e.target.checked) warmOnce();
              }}
              className="accent-blue-600 w-5 h-5"
            />
            <span className="text-sm font-medium">เปิดเสียงอ่านผลลัพธ์</span>
          </label>
        </div>

        {/* Result Summary */}
        {result ? (
          <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-2xl border border-gray-100">
            <div className="text-lg font-semibold text-gray-800 mb-1">
              ผลลัพธ์:
              <span
                className={`ml-1 ${LABELS[result.pred] === "ดินทรุด"
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

            <div className="text-sm text-gray-600 mb-3">
              prob: {result.prob.map(v => v.toFixed(3)).join(", ")}
            </div>

            {summary && (
              <div className="mt-3 bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100">
                <div>
                  <strong className="text-gray-800">สรุป:</strong> {summary.label} |
                  <span className="ml-1">ระดับ: {summary.level}</span> |
                  <span className="ml-1 text-blue-600 font-medium">
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
          </div>
        ) : (
          <div className="text-gray-400 italic mt-4">ยังไม่มีผลลัพธ์</div>
        )}

        {/* Condition Cards */}
        {result && (
          <div className=" mt-12">
            {/* DANGEROUS */}
            {LABELS[result.pred] === "ดินทรุด" && (
              <div className="bg-white rounded-2xl shadow-lg border border-red-100 overflow-hidden transform hover:scale-105 transition-all duration-300">
                <div className="bg-gradient-to-r from-[#6B0A1C] to-[#E9163C] text-white text-center py-3 text-2xl font-bold tracking-widest">
                  DANGEROUS
                </div>
                <div className="flex items-center justify-center gap-4 p-6">
                  <img
                    src="./assets/img/alert-bell.svg"
                    alt="dangerous_pic"
                    className="w-[80px] h-[80px]"
                  />
                  <div className="text-xl font-semibold text-gray-800">
                    อันตราย! <br />
                    ดินทรุดตัว
                  </div>
                </div>
              </div>
            )}

            {/* WARNING */}
            {LABELS[result.pred] === "เสี่ยงดินทรุด" && (
              <div className="bg-white rounded-2xl shadow-lg border border-yellow-100 overflow-hidden transform hover:scale-105 transition-all duration-300">
                <div className="bg-gradient-to-r from-[#f2a600] to-[#ffcc32] text-white text-center py-3 text-2xl font-bold tracking-widest">
                  WARNING
                </div>
                <div className="flex items-center justify-center gap-4 p-6">
                  <img
                    src="./assets/img/warning.svg"
                    alt="warning_pic"
                    className="w-[80px] h-[80px]"
                  />
                  <div className="text-xl font-semibold text-gray-800">
                    โปรดระวัง! <br />
                    ดินทรุดตัว
                  </div>
                </div>
              </div>
            )}

            {/* NORMAL */}
            {LABELS[result.pred] === "ปกติ" && (
              <div className="bg-white rounded-2xl shadow-lg border border-green-100 overflow-hidden transform hover:scale-105 transition-all duration-300">
                <div className="bg-gradient-to-r from-[#1C6016] to-[#32AA27] text-white text-center py-3 text-2xl font-bold tracking-widest">
                  NORMAL
                </div>
                <div className="flex items-center justify-center gap-4 p-6">
                  <img
                    src="./assets/img/green-leaf.svg"
                    alt="normal_pic"
                    className="w-[80px] h-[80px]"
                  />
                  <div className="text-xl font-semibold text-gray-800">
                    สภาวะปกติ
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
