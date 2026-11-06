// Shared timeline: scene bounds, voiceover placement, word cues and SFX events.
// Loaded by index.html (after vo/words.js) and by audio.mjs.
// Times are "story time": the intro (s0) lives before 0, so the original scenes keep their cue times.
// Video frame f shows story time START + f / FPS.
var TL = (function () {
  var FPS = 60, W_ = 1080, H_ = 1920;
  var SCENES = [
    { id: "s0", a: -8, b: 0, vo: -7.75 },
    { id: "s1", a: 0, b: 6.5, vo: 0.6 },
    { id: "s2", a: 6.5, b: 16, vo: 7.3 },
    { id: "s3", a: 16, b: 24, vo: 16.9 },
    { id: "s4", a: 24, b: 40.5, vo: 24.6 },
    { id: "s5", a: 40.5, b: 53, vo: 41.1 },
    { id: "s6", a: 53, b: 65, vo: 53.6 },
    { id: "s7", a: 65, b: 76, vo: 65.6 },
    { id: "s8", a: 76, b: 89, vo: 76.6 },
    { id: "s9", a: 89, b: 98.4, vo: 89.7 },
    { id: "s10", a: 98.4, b: 107, vo: 98.9 },
  ];
  var START = SCENES[0].a, END = SCENES[SCENES.length - 1].b, DURATION = END - START;
  var byId = {};
  SCENES.forEach(function (s) { byId[s.id] = s; });

  function norm(s) { return s.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ""); }
  // Absolute time (s) when word `prefix` (nth match) starts in line `id`.
  function W(id, prefix, nth) {
    var list = VO_WORDS[id], p = norm(prefix), n = nth || 0;
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].w).indexOf(p) === 0) { if (n-- === 0) return byId[id].vo + list[i].t; }
    }
    throw new Error("cue not found: " + id + " " + prefix);
  }
  function voEnd(id) { return byId[id].vo + VO_DUR[id]; }
  var A9 = byId.s9.a, A10 = byId.s10.a;

  // Visual cue times (used by the page) — all SFX below hang off these.
  var C = {
    // intro: gift box → app
    boxIn: -7.95, boxLand: -7.6, tb: W("s0", "тоқ"), lid: W("s0", "приложениесін") - .12, app: W("s0", "приложениесін"),
    free: W("s0", "тегін"), made: W("s0", "жасап"), ask: W("s0", "ал") - .15, how: W("s0", "қалай"), work: W("s0", "жұмыс"),
    show: W("s0", "көрсетейін"), dive0: -1.0,
    rcptIn: 0.15, tear: 2.05, stripIn: 3.05, dive1: 5.55,
    s2open: 6.5, bolt: 15.25, boltOpen: 15.55, impact: 16.0,
    logoTop: 16.35, logoBot: 16.6, logoBolt: 16.85, letters: 17.05,
    cards: W("s3", "платформасын") + 0.1, live: W("s3", "жұмыс"), dive3: 23.2,
    s4lift: 24.0,
    combo: W("s4", "ком"), patty: W("s4", "котлета"), cheese: W("s4", "ірімшік"),
    wa: W("s4", "уотсап"), code: W("s4", "кодпен"), courier: W("s4", "курьерді"),
    bonus: W("s4", "бонус"), lang: W("s4", "қазақша"), wipe45: 39.95,
    order: W("s5", "жаңа"), branch: W("s5", "бес"), nearest: W("s5", "жақынына"),
    stop: W("s5", "стоп"), dive5: 52.35,
    manual: W("s6", "қолмен"), gps: W("s6", "жи-пи-эс"), nearestC: W("s6", "ең"),
    batch: W("s6", "бір", 0), merge: W("s6", "біріктіреді"), wipe67: 64.45,
    price: W("s7", "баға"), promo: W("s7", "акция"), zone: W("s7", "жеткізу"),
    staff: W("s7", "қызметкерлер"), manage: W("s7", "басқарасыз"), log: W("s7", "журнал"), push78: 75.4,
    agg: W("s8", "қазіргі"), newc: W("s8", "жаңа"), regular: W("s8", "тұрақты"),
    bonus8: W("s8", "бонус"), own: W("s8", "сайтыңызға"), nocomm: W("s8", "приложение"), iris: A9 - .5,
    ready: W("s9", "сайт"), working: W("s9", "жұмыс"), next: W("s9", "келесі"), stores: W("s9", "эп"),
    // outro: "do you need your own app? — write"
    bubble: A10 - .4, you: W("s10", "сізге"), yours: W("s10", "өзіңіздің"), appq: W("s10", "приложениеңіз"),
    need: W("s10", "керек"), write: W("s10", "жазыңыз"),
  };

  var SFX = [
    // s0 intro
    ["whoosh", C.boxIn - .05], ["thud", C.boxLand], ["hop", C.boxLand + .12, ], ["tick", C.tb], ["tick", C.tb + .2],
    ["pop", C.lid], ["swish", C.lid + .05], ["coinUp", C.app + .15], ["chime", C.app + .35], ["stamp", C.free + .05],
    ["tick", C.made], ["whoosh", C.ask], ["pop", C.how], ["pop", C.work], ["blip", C.work + .55], ["whooshDeep", C.dive0 + .1],
    // s1..
    ["slide", C.rcptIn], ["tick", 0.75], ["tick", 0.95], ["tick", 1.15], ["tick", 1.35],
    ["tear", C.tear], ["whoosh", C.tear + 0.35], ["thud", C.stripIn],
    ["whooshDeep", C.dive1 + 0.2],
    ["stamp", 0],
    ["zapRise", C.bolt - 0.35], ["boom", C.impact],
    ["pop", C.logoTop + 0.25], ["pop", C.logoBot + 0.25], ["swish", C.logoBolt], ["tick", C.letters], ["tick", C.letters + 0.16], ["tick", C.letters + 0.32],
    ["flick", C.cards], ["flick", C.cards + 0.25], ["flick", C.cards + 0.5], ["flick", C.cards + 0.75],
    ["blip", C.live], ["whooshDeep", C.dive3 + 0.3],
    ["paperLift", C.s4lift], ["swish", C.combo], ["tap", C.patty + 0.05], ["coinUp", C.patty + 0.12], ["tap", C.cheese + 0.05], ["coinUp", C.cheese + 0.12],
    ["swish", C.wa - 0.1], ["type", C.wa + 0.4], ["chime", C.code + 0.35], ["swish", C.courier - 0.1], ["blip", C.courier + 0.6],
    ["coins", C.bonus + 0.1], ["flip", C.lang], ["whoosh", C.wipe45 + 0.1],
    ["bell", C.order + 0.1], ["pop", C.branch + 0.1], ["blip", C.nearest + 0.25], ["stamp", C.stop + 0.15], ["whooshDeep", C.dive5 + 0.3],
    ["scratch", C.manual + 0.2], ["sonar", C.gps], ["blip", C.nearestC + 0.5], ["pop", C.batch], ["swish", C.merge], ["whoosh", C.wipe67 + 0.15],
    ["tap", C.price + 0.1], ["pop", C.promo + 0.05], ["swish", C.zone], ["pop", C.staff + 0.05], ["type", C.log + 0.2], ["slide", C.push78 + 0.1],
    ["tock", C.agg + 0.1], ["hop", C.regular + 0.3], ["coins", C.bonus8], ["tock", C.own + 0.2], ["tock", C.nocomm + 0.05], ["whooshDeep", C.iris + 0.15],
    ["pop", A9 + .5], ["pop", A9 + .8], ["swish", A9 + 1.05], ["chime", C.working + 0.1], ["pop", C.stores + 0.1], ["pop", C.stores + 0.35],
    // s10 outro
    ["whooshDeep", C.bubble - .1], ["pop", C.you], ["pop", C.yours], ["swish", C.appq], ["flick", C.appq + .1], ["flick", C.appq + .25],
    ["flick", C.appq + .4], ["flick", C.appq + .55], ["flick", C.appq + .7], ["flick", C.appq + .85], ["pop", C.need + .35],
    ["boom", C.write], ["type", C.write + .45], ["chime", C.write + 1.3],
  ];
  // the "емес" stamp in scene 2
  SFX.forEach(function (e) { if (e[0] === "stamp" && e[1] === 0) e[1] = W("s2", "емес") + 0.05; });

  return { FPS: FPS, W: W_, H: H_, START: START, END: END, DURATION: DURATION, SCENES: SCENES, byId: byId, cue: W, voEnd: voEnd, C: C, SFX: SFX };
})();
if (typeof module !== "undefined") module.exports = TL;
