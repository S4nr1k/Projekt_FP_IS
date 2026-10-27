// ---- LAUNCH SITES ----
// Główne kosmodromy świata. Identyfikatory zgodne z oficjalną listą Space-Track SATCAT.
// Lista geograficznych faktów - bez praw autorskich.
var LAUNCH_SITES = [
  // USA
  { id: "AFETR", name: "Cape Canaveral / KSC", lat: 28.4889,  lng: -80.5778,  country: "USA",      operators: ["NASA", "SpaceX", "ULA", "USSF"] },
  { id: "AFWTR", name: "Vandenberg SFB",       lat: 34.7420,  lng: -120.5724, country: "USA",      operators: ["USSF", "SpaceX", "ULA"] },
  { id: "WLPIS", name: "Wallops Island",       lat: 37.9402,  lng: -75.4664,  country: "USA",      operators: ["NASA", "Rocket Lab"] },
  // Rosja / ZSRR / Kazachstan
  { id: "TTMTR", name: "Baikonur Cosmodrome",  lat: 45.9650,  lng: 63.3050,   country: "Kazakhstan", operators: ["Roscosmos"] },
  { id: "PKMTR", name: "Plesetsk Cosmodrome",  lat: 62.9572,  lng: 40.6822,   country: "Russia",   operators: ["Roscosmos", "VKS"] },
  { id: "VOSTO", name: "Vostochny Cosmodrome", lat: 51.8847,  lng: 128.3336,  country: "Russia",   operators: ["Roscosmos"] },
  { id: "KYMTR", name: "Kapustin Yar",         lat: 48.5707,  lng: 45.7635,   country: "Russia",   operators: ["Roscosmos"] },
  { id: "SVOB",  name: "Svobodny",             lat: 51.8200,  lng: 128.1100,  country: "Russia",   operators: ["Roscosmos"] },
  // Chiny
  { id: "JSC",   name: "Jiuquan Satellite",    lat: 40.9583,  lng: 100.2917,  country: "China",    operators: ["CNSA"] },
  { id: "TSC",   name: "Taiyuan Satellite",    lat: 38.8487,  lng: 111.6086,  country: "China",    operators: ["CNSA"] },
  { id: "XSC",   name: "Xichang Satellite",    lat: 28.2462,  lng: 102.0263,  country: "China",    operators: ["CNSA"] },
  { id: "WSC",   name: "Wenchang Space",       lat: 19.6144,  lng: 110.9514,  country: "China",    operators: ["CNSA"] },
  // Europa
  { id: "FRGUI", name: "Kourou (CSG)",         lat: 5.2389,   lng: -52.7682,  country: "French Guiana", operators: ["ESA", "Arianespace"] },
  // Japonia
  { id: "TNSTA", name: "Tanegashima Space",    lat: 30.4011,  lng: 130.9776,  country: "Japan",    operators: ["JAXA"] },
  { id: "KSCUT", name: "Uchinoura Space",      lat: 31.2517,  lng: 131.0786,  country: "Japan",    operators: ["JAXA"] },
  // Indie
  { id: "SRI",   name: "Satish Dhawan",        lat: 13.7199,  lng: 80.2304,   country: "India",    operators: ["ISRO"] },
  // Nowa Zelandia
  { id: "RLLC",  name: "Mahia (Rocket Lab)",   lat: -39.2625, lng: 177.8650,  country: "New Zealand", operators: ["Rocket Lab"] },
  // Sea Launch (platforma mobilna - przybliżona pozycja eksploatacyjna)
  { id: "SEAL",  name: "Sea Launch (mobile)",  lat: 0.0,      lng: -154.0,    country: "International", operators: ["Sea Launch"] },
];

