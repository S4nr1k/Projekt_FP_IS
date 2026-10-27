"use strict";

// To zamienia znaki specjalne HTML na encje (dane zewnetrzne wstawiane do innerHTML)
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"'`]/g, function(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c];
  });
}
// To zostawia w numerze NORAD tylko cyfry (wartosc wstawiana do atrybutu onclick)
function nid(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }

var DEG = Math.PI / 180;
var EARTH_R = 6371;

var CAT_COLOR = {
  starlink: "#00ff66",   // accent (zieleń terminala)
  iss:      "#ffcc00",   // warn (żółty alarm - coś ważnego)
  weather:  "#88ddaa",   // jasna zieleń
  gps:      "#44aa77",   // ciemniejsza zieleń
  science:  "#aaffcc",   // bardzo jasna zieleń
  other:    "#557766",   // szaro-zielony (szczątki)
  all:      "#00ff66",
};

