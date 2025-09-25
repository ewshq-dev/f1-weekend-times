// api/weather.js — Vercel Serverless Function
const url = new URL(request.url);
const roundParam = url.searchParams.get('round');


// Choose GP: either by ?round= or next upcoming by Race start
let rounds = schedule.rounds || [];
let gp = null;
if(roundParam){ gp = rounds.find(r => String(r.round) === String(roundParam)); }
if(!gp){
const now = Date.now();
const sessions = [];
for(const r of rounds){
const race = r.sessions.find(s => s.type.toLowerCase().includes('race')) || r.sessions[r.sessions.length-1];
if(!race) continue; sessions.push({ gp:r, ts: Date.parse(race.start_utc) });
}
sessions.sort((a,b)=>a.ts-b.ts);
gp = sessions.find(x => x.ts > now)?.gp || (rounds.length ? rounds[rounds.length-1] : null);
}
if(!gp){ return new Response(JSON.stringify({ active:false, error:'no_gp' }), { headers: { 'content-type':'application/json' }, status: 200 }); }


// Gate by active window
if(!withinActiveWindow(gp)){
return new Response(JSON.stringify({ active:false, reason:'outside_event_window' }), {
headers: { 'content-type':'application/json', 'cache-control': 'public, max-age=300, s-maxage=300' }, status: 200
});
}


// Fetch Open‑Meteo
const om = new URL('https://api.open-meteo.com/v1/forecast');
om.searchParams.set('latitude', String(gp.lat));
om.searchParams.set('longitude', String(gp.lon));
om.searchParams.set('timezone', gp.tz);
om.searchParams.set('current_weather', 'true');
om.searchParams.set('hourly', 'temperature_2m,precipitation,cloudcover,relativehumidity_2m,windspeed_10m,winddirection_10m,weathercode');


let data;
try{
const r = await fetch(om.toString(), { headers: { 'user-agent': 'WeekendRaceTimes/1.0' } });
if(!r.ok) throw new Error('provider_bad_status');
data = await r.json();
}catch(e){
return new Response(JSON.stringify({ active:true, error:'provider_error' }), {
headers: { 'content-type':'application/json', 'cache-control': 'public, max-age=120, s-maxage=120' }, status: 200
});
}


// Pack compact payload
const times = data?.hourly?.time || [];
const H = (arr,i,def=0)=> Array.isArray(arr)&&arr[i]!=null ? arr[i] : def;
const hourly = times.map((t,i)=>({
time: t,
temperature_c: H(data.hourly.temperature_2m,i),
precip_mm: H(data.hourly.precipitation,i),
cloudcover_pct: H(data.hourly.cloudcover,i),
humidity_pct: H(data.hourly.relativehumidity_2m,i),
wind_kph: H(data.hourly.windspeed_10m,i),
wind_dir: H(data.hourly.winddirection_10m,i),
weathercode: H(data.hourly.weathercode,i)
}));


const current = data.current_weather ? {
time: data.current_weather.time,
temperature_c: data.current_weather.temperature,
wind_kph: data.current_weather.windspeed,
wind_dir: data.current_weather.winddirection,
weathercode: data.current_weather.weathercode
} : null;


return new Response(JSON.stringify({
active: true,
gp: `${gp.grand_prix} Grand Prix`,
tz: gp.tz,
generated_at: toISO(Date.now()),
current,
hourly
}), {
headers: { 'content-type':'application/json', 'cache-control': `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=1800` }, status: 200
});
}


export default handler;
