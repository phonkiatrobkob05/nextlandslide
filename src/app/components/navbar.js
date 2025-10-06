// app/(wherever)/components/navbar.js
"use client";
import { useState } from "react";

export default function Navbar({ audioEnabled, onToggle }) {
  const [local, setLocal] = useState(audioEnabled ?? false);

  return (
    <nav className="w-full p-4 px-8 bg-gradient-to-r from-[#3b8d26] to-[#62bb2a] text-white flex items-center justify-between">
      <div className="flex items-center text-2xl font-bold">
        <img src="/assets/img/mountain-city.svg" alt="Logo" className="h-8 w-8 inline-block mr-4" />
        <h1>Land Subsidence</h1>
      </div>

      <div className="flex">
        <label
          onClick={() => {
            const next = !local;
            setLocal(next);
            onToggle?.(next);        // ← tell parent
          }}
          className="flex items-center gap-3 cursor-pointer select-none hover:opacity-90 transition"
        >
          <div className={`relative w-14 h-8 rounded-full shadow-inner transition-colors duration-300 ${local ? "bg-green-500" : "bg-gray-500"}`}>
            <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${local ? "translate-x-6" : ""}`} />
          </div>
          <span className="text-lg text-black font-medium italic">TTS</span>
        </label>
      </div>
    </nav>
  );
}
