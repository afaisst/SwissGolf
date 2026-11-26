// SwissGolf – Golf Club Les Bois (Les Bois, Jura)
// Layout from OpenStreetMap (osm.js), ground from swisstopo swissALTI3D (terrain.js), trees from the
// swissSURFACE3D raster (trees.js). This file adds names, pars and the scorecard lengths.
window.SWISSGOLF = window.SWISSGOLF || { courses: {}, terrain: {}, osm: {} };
SWISSGOLF.courses.LesBois = {
  name: 'Golf Club Les Bois',
  location: 'Les Bois, Franches-Montagnes JU · Switzerland',
  blurb: 'An 18-hole par 72 on the high plateau of the Franches-Montagnes, about 1000 m above sea level: open pastures and spruce woods, a pond on the front nine – and the narrow-gauge railway to La Chaux-de-Fonds running right through the course.',
  accent: '#2e9e5b',
  terrain: 'LesBois',
  osm: 'LesBois',
  holes: {
    1: { par: 4, tees: { white: 373, yellow: 343, blue: 326, red: 298 } },
    2: { par: 4, tees: { white: 360, yellow: 333, blue: 314, red: 287 } },
    3: { par: 5, tees: { white: 495, yellow: 471, blue: 415, red: 387 } },
    4: { par: 4, tees: { white: 385, yellow: 354, blue: 313, red: 300 } },
    5: { par: 3, tees: { white: 177, yellow: 177, blue: 157, red: 157 } },
    6: { par: 4, tees: { white: 335, yellow: 321, blue: 289, red: 285 } },
    7: { par: 3, tees: { white: 162, yellow: 142, blue: 129, red: 116 } },
    8: { par: 4, tees: { white: 334, yellow: 306, blue: 291, red: 258 } },
    9: { par: 4, tees: { white: 364, yellow: 347, blue: 326, red: 293 } },
    10: { par: 4, tees: { white: 351, yellow: 341, blue: 294, red: 285 } },
    11: { par: 4, tees: { white: 323, yellow: 297, blue: 280, red: 249 } },
    12: { par: 4, tees: { white: 397, yellow: 374, blue: 330, red: 297 } },
    13: { par: 5, tees: { white: 485, yellow: 450, blue: 412, red: 395 } },
    14: { par: 5, tees: { white: 453, yellow: 445, blue: 401, red: 366 } },
    15: { par: 3, tees: { white: 138, yellow: 131, blue: 119, red: 109 } },
    16: { par: 4, tees: { white: 338, yellow: 310, blue: 296, red: 271 } },
    17: { par: 3, tees: { white: 154, yellow: 138, blue: 131, red: 112 } },
    18: { par: 5, tees: { white: 455, yellow: 455, blue: 406, red: 385 } },
  },
};
