// SwissGolf – Golfclub Unterengstringen (Fahrweid, Weiningen ZH)
// The layout itself (greens, tees, fairways, bunkers, paths, buildings, holes) comes from OpenStreetMap
// (osm.js) and the ground from swisstopo swissALTI3D (terrain.js). This file only adds what the map
// does not know: names, pars and the scorecard lengths from the birdie book.
window.SWISSGOLF = window.SWISSGOLF || { courses: {}, terrain: {}, osm: {} };
SWISSGOLF.courses.Unterengstringen = {
  name: 'Golfclub Unterengstringen',
  location: 'Fahrweid, Weiningen ZH · Switzerland',
  blurb: 'A compact 9-hole parkland course inside a bend of the Limmat: creeks and biotope ponds, tight tree lines along the river woods and the club house right by the 1st tee.',
  accent: '#d52b1e',
  terrain: 'Unterengstringen',   // SWISSGOLF.terrain key (maps/Unterengstringen/terrain.js)
  osm: 'Unterengstringen',       // SWISSGOLF.osm key     (maps/Unterengstringen/osm.js)
  holes: {
    // scorecard length (m) per tee colour; tees are placed this far apart along the OSM hole line
    1: { par: 4, tees: { white: 373, yellow: 355, blue: 331, red: 316 } },
    2: { par: 3, tees: { white: 176, yellow: 165, blue: 148, red: 139 } },
    3: { par: 5, tees: { white: 468, yellow: 454, blue: 424, red: 414 } },
    4: { par: 4, tees: { white: 329, yellow: 319, blue: 305, red: 295 } },
    5: { par: 3, tees: { white: 188, yellow: 174, blue: 156, red: 142 } },
    6: { par: 4, tees: { white: 329, yellow: 321, blue: 309, red: 297 } },
    7: { par: 4, tees: { white: 304, yellow: 292, blue: 261, red: 251 } },
    8: { par: 4, tees: { white: 370, yellow: 357, blue: 322, red: 309 } },
    9: { par: 4, tees: { white: 311, yellow: 287, blue: 268, red: 249 } },
  },
};
