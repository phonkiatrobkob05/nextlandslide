"use client";
import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const SENSOR_NAMES = {
  sensor001: "เซนเซอร์หลัก (Main Sensor)",
  sensor002: "ริมถนน (Roadside Sensor)",
  sensor003: "หลังโรงเรียน (Behind School)",
};
export default function MqttClient({ sub = "sensor/landslide/data/sensor1", onData }) {
  const clientRef = useRef(null);
  const startedRef = useRef(false); // guard StrictMode double-mount
  const onDataRef = useRef(onData);
  const subRef = useRef(sub);
  const [sensorName, setSensorName] = useState("");

  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const [lastTopic, setLastTopic] = useState("-");
  const [lastRaw, setLastRaw] = useState("");

  // keep latest props without recreating the client
  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { subRef.current = sub; }, [sub]);

  const connectClient = () => {
    // If there’s an existing client, close it first
    if (clientRef.current) {
      try { clientRef.current.end(true); } catch { }
      clientRef.current = null;
    }

    const url =
      process.env.NEXT_PUBLIC_MQTT_URL; // ws://.../mqtt or wss://.../mqtt
    const user =
      process.env.NEXT_PUBLIC_MQTT_USER ??
      process.env.NEXT_PUBLIC_MQTT_USERNAME;
    const pass =
      process.env.NEXT_PUBLIC_MQTT_PASS ??
      process.env.NEXT_PUBLIC_MQTT_PASSWORD;

    if (!url) {
      console.error("Missing NEXT_PUBLIC_MQTT_URL");
      setStatus("config-missing");
      return;
    }

    setStatus("connecting…");
    console.log("[MQTT] connecting:", url, "auth:", user ? "with-creds" : "no-creds");

    const client = mqtt.connect(url, {
      clientId: "web_" + Math.random().toString(16).slice(2),
      username: user || undefined,
      password: pass || undefined,
      clean: true,
      reconnectPeriod: 0,     // manual reconnect only
      keepalive: 30,
      connectTimeout: 10000,
      protocolVersion: 4,
      resubscribe: false,     // we'll manage subs
    });

    clientRef.current = client;

    client.on("connect", (connack) => {
      setStatus("พร้อมใช้งาน 🟢");
      console.log("[MQTT] connected", connack);

      client.subscribe(subRef.current, { qos: 0 }, (err) => {
        if (err) console.error("subscribe failed:", err);
        else console.log("[MQTT] subscribed:", subRef.current);
      });
    });

    client.on("message", (topic, message) => {
      const str = message?.toString?.() ?? "";
      setLastTopic(topic);
      setLastRaw(str);
      const parts = topic.split("/");
      const sensorId = parts[parts.length - 1]; // e.g. "sensor001"
      setSensorName(SENSOR_NAMES[sensorId] || sensorId);
      if (str.startsWith("{") && str.endsWith("}")) {
        try {
          const obj = JSON.parse(str);
          onDataRef.current?.(topic, obj);
          return;
        } catch (e) {
          console.warn("⚠️ JSON parse failed:", e);
        }
      }
      console.warn("⚠️ non-JSON message:", str);
    });

    // no 'reconnect' handler (we're manual)
    client.on("close", () => setStatus("ไม่พร้อมใช้งาน 🔴"));
    client.on("error", (err) => {
      console.error("[MQTT] error:", err?.message || err);
      setStatus("error");
    });
  };

  // initialize once (guard StrictMode)
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    connectClient();

    return () => {
      try { clientRef.current?.end(true); } catch { }
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-subscribe on topic change (no reconnect)
  useEffect(() => {
    const c = clientRef.current;
    if (!c) return;
    const newTopic = sub;
    const oldTopic = subRef.current;
    if (newTopic === oldTopic) return;
    if (oldTopic) c.unsubscribe(oldTopic, () => { });
    c.subscribe(newTopic, { qos: 0 }, (err) => {
      if (err) console.error("subscribe failed:", err);
      else console.log("[MQTT] re-subscribed:", newTopic);
    });
    subRef.current = newTopic;
  }, [sub]);

  // manual reconnect: rebuild client from scratch
  const reconnectManually = () => {
    console.log("[MQTT] manual reconnect (rebuild)...");
    connectClient();
  };

  return (
    <div className={`rounded-xl bg-white p-4 text-sm shadow  ${inter.className}`}>
      <div className="font-semibold text-gray-700 mb-2">สถานะเซนเซอร์ <span className="text-blue-700">{sensorName}</span>: {status}</div>

      <div className="text-xs text-gray-600">
        <div className="bg-gray-50 rounded-lg p-3 mt-3 text-sm shadow-inner">
          {(() => {
            try {
              const obj = JSON.parse(lastRaw);
              return (
                <div className="space-y-1 text-gray-800">
                  <div>อุณหภูมิ: <span className="font-semibold text-blue-700">{obj.Temp ?? obj.temp ?? "-"}</span> °C</div>
                  <div>ความชื้นในอากาศ: <span className="font-semibold text-teal-700">{obj.humid ?? obj.hum ?? "-"}</span> %</div>
                  <div>ความชื้นของดิน: <span className="font-semibold text-green-700">{obj.Soil ?? obj.soil ?? "-"}</span></div>
                </div>
              );
            } catch {
              return <div className="text-gray-500 italic">(waiting for valid JSON message)</div>;
            }
          })()}
        </div>

        <button
          onClick={reconnectManually}
          className="mt-3 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Reconnect MQTT
        </button>
      </div>
    </div>
  );
}
