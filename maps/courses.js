// SwissGolf – list of available golf courses.
// To add a course: create maps/<Id>/ with course.js, terrain.js, osm.js, trees.js (see tools/) and add one line here.
window.SWISSGOLF = window.SWISSGOLF || { courses: {}, terrain: {}, osm: {}, trees: {} };
SWISSGOLF.registry = [
  { id: 'Unterengstringen', dir: 'maps/Unterengstringen', files: ['terrain.js', 'osm.js', 'trees.js'] },
  { id: 'LesBois', dir: 'maps/LesBois', files: ['terrain.js', 'osm.js', 'trees.js'] },
];
