const state = {};

function mean(a){ return a.reduce((s,x)=>s+x,0)/a.length }
function sd(a){ if(a.length<=1) return 0; const m=mean(a); return Math.sqrt(a.reduce((s,x)=>(x-m)**2 + s,0)/(a.length-1)) }

export function makeRolling(sensorId, raw, baseCols){
  state[sensorId] ||= {};

  // อัปเดตบัฟเฟอร์ทุกคอลัมน์ก่อน
  for (const c of baseCols){
    const v = Number(raw[c]);
    if (!Number.isFinite(v)) return null;
    const buf = (state[sensorId][c] ||= []);
    buf.push(v);
    if (buf.length > 11) buf.shift();   // 10 ย้อนหลัง + ปัจจุบัน
  }

  // ต้องครบ 11 ทุกคอลัมน์
  for (const c of baseCols){
    if (state[sensorId][c].length < 11) return null;
  }

  // คำนวณ
  const f = {};
  for (const c of baseCols){
    const buf  = state[sensorId][c];
    const curr = buf[buf.length-1];
    const past = buf.slice(0, -1);
    const p10  = past.slice(-10);
    const p5   = past.slice(-5);

    f[c]                  = curr;
    f[`${c}_mean_5`]      = mean(p5);
    f[`${c}_std_5`]       = sd(p5);
    f[`${c}_mean_10`]     = mean(p10);
    f[`${c}_std_10`]      = sd(p10);
    f[`${c}_diff1`]       = curr - past[past.length-1];
  }
  return f;
}
