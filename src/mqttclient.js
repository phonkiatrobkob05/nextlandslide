"use client";
import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

export default function MqttClient({ sub = "sensor/landslide/data", onData }) {
  const clientRef = useRef(null);
  const [status, setStatus] = useState("disconnected");
  const [lastTopic, setLastTopic] = useState("-");
  const [lastRaw, setLastRaw] = useState("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_MQTT_URL;          // e.g. ws://localhost:8083/mqtt
    const user = process.env.NEXT_PUBLIC_MQTT_USER         // make sure names match your .env.local
      ?? process.env.NEXT_PUBLIC_MQTT_USERNAME;
    const pass = process.env.NEXT_PUBLIC_MQTT_PASS
      ?? process.env.NEXT_PUBLIC_MQTT_PASSWORD;

    if (!url) {
      console.error("Missing NEXT_PUBLIC_MQTT_URL (must be ws:// or wss:// and usually end with /mqtt)");
      setStatus("config-missing");
      return;
    }

    console.log("[MQTT] connecting:", url, "auth:", user ? "with-creds" : "no-creds");

    const client = mqtt.connect(url, {
      clientId: "web_" + Math.random().toString(16).slice(2),
      username: user || undefined,
      password: pass || undefined,
      clean: true,
      reconnectPeriod: 2000,
      protocolVersion: 4, // MQTT 3.1.1
    });
    clientRef.current = client;

    client.on("connect", (connack) => {
      setStatus("connected");
      console.log("[MQTT] connected", connack);
      // subscribe (and re-subscribe on reconnects)
      client.subscribe(sub, { qos: 0 }, (err) => {
        if (err) console.error("subscribe failed:", err);
        else console.log("[MQTT] subscribed:", sub);
      });

      // If you want a loopback test, publish JSON, not a plain string:
      // client.publish("test/topic", JSON.stringify({ hello: "from Next.js" }));
    });

    client.on("message", (topic, message) => {
      const str = message?.toString?.() ?? "";
      setLastTopic(topic);
      setLastRaw(str);

      if (str.startsWith("{") && str.endsWith("}")) {
        try {
          const obj = JSON.parse(str);
          onData?.(topic, obj);
          return;
        } catch (e) {
          console.warn("⚠️ JSON parse failed:", e);
        }
      }
      // Non-JSON messages are fine; we just show them in the UI.
      console.warn("⚠️ non-JSON message:", str);
    });

    client.on("reconnect", () => setStatus("reconnecting"));
    client.on("close", () => setStatus("disconnected"));
    client.on("error", (err) => {
      console.error("[MQTT] error:", err?.message || err);
      setStatus("error");
    });

    return () => {
      try { client.end(true); } catch {}
    };
  }, [sub, onData]);

  return (
    <div className="rounded-xl border bg-white p-4 text-sm shadow">
      <div className="font-semibold text-gray-700 mb-2">MQTT Status: {status}</div>
      <div className="text-xs text-gray-600">
        {/* Subscribed: <span className="font-mono">{sub}</span><br/>
        Last topic: <span className="font-mono">{lastTopic}</span> */}
        <pre className="bg-gray-50 p-2 rounded mt-2 max-h-40 overflow-auto">{lastRaw}</pre>
      </div>
    </div>
  );
}
