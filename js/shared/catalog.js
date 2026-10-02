// ═══════════════════════════════════════════════════════════════
//  CampusCare problem catalogue: every kind of campus problem,
//  which team fixes it, which issues are urgent, and the materials
//  a technician can record when marking the job fixed.
//  Edit this one file to add/rename categories, issues or parts.
// ═══════════════════════════════════════════════════════════════

const TEAMS = [
  'IT & Network Cell', 'Electrical Cell', 'Plumbing & Estate', 'Carpentry & Furniture',
  'Civil & Building Maintenance', 'Housekeeping & Sanitation', 'Mess & Food Services', 'Hostel Office',
  'Security Office', 'Medical Centre', 'Transport Section', 'Lab Technical Staff',
  'Library', 'Sports & Gym', 'Horticulture & Grounds',
];

// Markers at the start of an issue name:
//   "!"  urgent automatically (safety risk / major outage)
//   "*"  area-wide: affects many people, so it is shared by default and
//        others can press "Me too" instead of reporting it again
//   "#"  confidential: Admin only, never shared
const CATALOG = {
  IT: {
    label: 'IT & Network', icon: 'wifi', team: 'IT & Network Cell',
    issues: ['*Wi-Fi not working', '*Internet very slow', 'LAN port not working', 'Network cable damaged', '*Webmail / Google login issue', '*ERP / student portal not opening', 'Computer not starting', 'Software installation needed', 'Printer / scanner not working', '*Projector / smart board not working', 'Classroom mic / speaker not working', 'Biometric / attendance machine not working', 'Smart / ID card not working', 'Email / account creation request', 'CCTV camera not working'],
    materials: [['LAN cable', 'm'], ['RJ45 connector', 'pcs'], ['Patch cord', 'pcs'], ['Network switch', 'pcs'], ['Wi-Fi access point', 'pcs'], ['Keyboard', 'pcs'], ['Mouse', 'pcs'], ['RAM module', 'pcs'], ['SSD / hard disk', 'pcs'], ['Power supply (SMPS)', 'pcs'], ['Printer toner / cartridge', 'pcs'], ['HDMI / VGA cable', 'pcs'], ['Projector lamp', 'pcs'], ['Microphone / speaker', 'pcs']],
  },
  Electrical: {
    label: 'Electrical', icon: 'zap', team: 'Electrical Cell',
    issues: ['Fan not working', 'Fan making noise / slow', 'Tube light / bulb not working', 'Power socket not working', '!Switchboard sparking', '!MCB tripping again and again', '!*No power in room / area', '!Electric shock / burning smell', 'Geyser / water heater not working', '*Street light not working', 'Inverter / UPS not working', 'Extension board needed', '!*Lift / elevator stuck or not working', 'Doorbell / buzzer not working'],
    materials: [['Fan capacitor', 'pcs'], ['Fan regulator', 'pcs'], ['LED tube light', 'pcs'], ['LED bulb', 'pcs'], ['Switch', 'pcs'], ['Socket', 'pcs'], ['MCB', 'pcs'], ['Electric wire', 'm'], ['Bulb / tube holder', 'pcs'], ['Geyser heating element', 'pcs'], ['Thermostat', 'pcs'], ['UPS battery', 'pcs'], ['Insulation tape', 'pcs'], ['Fan motor rewinding', 'job']],
  },
  Appliances: {
    label: 'AC & Appliances', icon: 'air-vent', team: 'Electrical Cell',
    issues: ['AC not cooling', 'AC leaking water', 'AC making noise', 'AC remote not working', '*Water cooler not cooling', 'Refrigerator not working', '*Washing machine not working', 'Microwave / induction not working'],
    materials: [['AC gas refill', 'job'], ['AC filter', 'pcs'], ['AC capacitor', 'pcs'], ['AC PCB', 'pcs'], ['Drain pipe', 'm'], ['Remote / batteries', 'pcs'], ['Compressor', 'pcs'], ['Washing machine belt', 'pcs'], ['Water cooler thermostat', 'pcs']],
  },
  Plumbing: {
    label: 'Water & Plumbing', icon: 'droplets', team: 'Plumbing & Estate',
    issues: ['Tap leaking', '!*No water supply', '*Low water pressure', 'Flush not working', 'Washroom / toilet blocked', '!*Drain overflowing', '!Pipe burst / major leak', 'Water tank overflowing', '*Drinking water (RO) not working', '*No hot water', 'Bad smell from drain', 'Shower not working'],
    materials: [['Tap', 'pcs'], ['Washer / O-ring', 'pcs'], ['PVC pipe', 'm'], ['Pipe fitting / elbow', 'pcs'], ['Flush valve', 'pcs'], ['Cistern', 'pcs'], ['Ball valve', 'pcs'], ['Teflon tape', 'pcs'], ['Drain cleaner', 'pcs'], ['RO filter / membrane', 'pcs'], ['Shower head', 'pcs'], ['Health faucet', 'pcs']],
  },
  Hostel: {
    label: 'Furniture & Carpentry', icon: 'armchair', team: 'Carpentry & Furniture',
    issues: ['Bed broken', 'Mattress damaged / needed', 'Chair broken', 'Table / study desk broken', 'Cupboard / wardrobe broken', 'Cupboard lock broken', 'Door not closing properly', '!Door lock jammed / broken', '!Window glass broken', 'Window not closing', 'Curtain rod broken', 'Mosquito net hooks needed', 'Bookshelf broken'],
    materials: [['Door hinge', 'pcs'], ['Door lock', 'pcs'], ['Tower bolt', 'pcs'], ['Handle', 'pcs'], ['Screws / nails', 'pack'], ['Plywood sheet', 'pcs'], ['Laminate sheet', 'pcs'], ['Adhesive (Fevicol)', 'pcs'], ['Glass pane', 'pcs'], ['Caster wheel', 'pcs'], ['Mattress', 'pcs'], ['Curtain rod', 'pcs']],
  },
  Civil: {
    label: 'Building & Civil', icon: 'building-2', team: 'Civil & Building Maintenance',
    issues: ['Wall crack', 'Water seepage / damp wall', 'Roof leaking', 'Paint peeling', 'Floor tiles broken', '!Ceiling plaster falling', '!*Staircase / railing damaged', '*Road / pathway damaged', '*Waterlogging near building', 'Ramp / accessibility issue', 'Window / door frame damaged', 'Notice board / signage broken'],
    materials: [['Cement', 'bag'], ['Sand', 'bag'], ['Wall putty', 'kg'], ['Paint', 'L'], ['Floor tiles', 'pcs'], ['Waterproofing compound', 'L'], ['Tile grout', 'kg'], ['Steel railing part', 'pcs']],
  },
  Housekeeping: {
    label: 'Cleaning & Pests', icon: 'sparkles', team: 'Housekeeping & Sanitation',
    issues: ['Room / corridor not cleaned', '*Washroom not cleaned', '*Garbage not collected', 'Dustbin needed / broken', 'Cockroaches / rats', '*Mosquito problem (fogging needed)', 'Bed bugs', '*Stray animals', '!Snake sighted', 'Dead animal to be removed', 'Bad smell in area', 'Water bottle / cooler area dirty'],
    materials: [['Cleaning chemical', 'L'], ['Phenyl', 'L'], ['Garbage bags', 'pack'], ['Dustbin', 'pcs'], ['Pesticide spray', 'L'], ['Fogging chemical', 'L'], ['Rat trap / bait', 'pcs'], ['Bed bug treatment', 'job'], ['Mop / broom', 'pcs']],
  },
  Mess: {
    label: 'Mess & Canteen', icon: 'utensils', team: 'Mess & Food Services',
    issues: ['*Food quality poor', '*Hygiene / cleanliness issue', '*Food quantity not enough', '*Menu not followed', '*Utensils / plates dirty', '*Drinking water at mess', '*Mess timing issue', '*Canteen overcharging', 'Insect / foreign object in food'],
    materials: [['Utensils replaced', 'pcs'], ['Water filter', 'pcs'], ['Cleaning supplies', 'pack'], ['Gas cylinder', 'pcs']],
  },
  HostelOffice: {
    label: 'Hostel Office', icon: 'bed-double', team: 'Hostel Office',
    issues: ['Room change request', 'Room key lost / duplicate key', 'Hostel ID / access card issue', '*Laundry service issue', '*Common room TV / facilities', 'Noise / disturbance complaint', 'Visitor / guest room request', 'Room inventory missing'],
    materials: [['Duplicate key', 'pcs'], ['Access card', 'pcs'], ['TV remote / batteries', 'pcs']],
  },
  Security: {
    label: 'Security & Safety', icon: 'shield-alert', team: 'Security Office',
    issues: ['!Theft / item stolen', 'Lost & found', '!Suspicious person on campus', '*Gate / entry problem', '*Parking problem', '!Fire hazard / fire extinguisher missing', 'Security guard not at post', '#Harassment / ragging'],
    materials: [['Fire extinguisher refill', 'pcs'], ['Lock / chain', 'pcs'], ['Signage board', 'pcs']],
  },
  Medical: {
    label: 'Medical', icon: 'heart-pulse', team: 'Medical Centre',
    issues: ['!Need doctor / first aid', '!Ambulance needed', '*Medicine not available', '*Medical centre hygiene', 'Medical certificate request'],
    materials: [['Medicine supplied', 'pcs'], ['First-aid kit', 'pcs']],
  },
  Transport: {
    label: 'Transport', icon: 'bus', team: 'Transport Section',
    issues: ['*Campus bus late / missed', '*Bus route or timing change needed', 'Vehicle request (official)', 'Driver behaviour', '*Bus condition / cleanliness'],
    materials: [],
  },
  Lab: {
    label: 'Labs', icon: 'flask-conical', team: 'Lab Technical Staff',
    issues: ['Lab equipment not working', 'Lab computer not working', 'Software / license needed', '*Lab AC not cooling', 'Instrument calibration needed', 'Components / consumables needed', '!Lab UPS / power backup failed'],
    materials: [['Electronic components', 'pcs'], ['Cables / connectors', 'pcs'], ['Software license', 'pcs'], ['Fuse', 'pcs'], ['Calibration', 'job'], ['Consumables', 'pack']],
  },
  Library: {
    label: 'Library', icon: 'library', team: 'Library',
    issues: ['Book not available', '*Seating / lighting in library', '*Library computer / e-resources not working', 'Library account / fine issue', '*Library AC / noise issue'],
    materials: [['Book procured', 'pcs'], ['Lamp / bulb', 'pcs']],
  },
  Sports: {
    label: 'Sports & Gym', icon: 'dumbbell', team: 'Sports & Gym',
    issues: ['*Gym equipment broken', 'Sports equipment needed', '*Court / ground needs maintenance', '*Sports room lights not working', '*Changing room issue'],
    materials: [['Net', 'pcs'], ['Ball', 'pcs'], ['Gym spare part', 'pcs'], ['Lubricant', 'pcs'], ['Nuts & bolts', 'pack'], ['Court marking paint', 'L']],
  },
  Grounds: {
    label: 'Gardens & Grounds', icon: 'trees', team: 'Horticulture & Grounds',
    issues: ['*Grass cutting needed', '!*Tree / branch fallen', '*Garden maintenance', '*Waterlogging in grounds', '*Overgrown bushes near path'],
    materials: [['Grass-cutter fuel', 'L'], ['Saplings', 'pcs'], ['Fertilizer', 'kg'], ['Soil', 'bag']],
  },
  Academic: {
    label: 'Academic & Grievances', icon: 'graduation-cap', team: null,
    // "#" issues are CONFIDENTIAL — only the Administrator and the reporter ever
    // see them (they go to the private grievance collection). Use these for
    // complaints about a person. The rest are normal academic/admin requests.
    issues: [
      '#Complaint about a faculty member',
      '#Unfair treatment or bias by faculty / staff',
      '#Grading or evaluation dispute',
      '#Teaching quality concern',
      '#Misconduct / harassment by staff or faculty',
      '#Other confidential grievance',
      'Class schedule / timetable issue',
      'Exam or result related issue',
      'Course registration problem',
      'Attendance correction request',
      'Scholarship / fee related issue',
      'Certificate / document request',
    ],
    materials: [],
  },
  Other: {
    label: 'Something else', icon: 'help-circle', team: null,
    issues: ['Something else (describe it in the details)', '#Something else (confidential)'],
    materials: [],
  },
};

// ═══════════════════════════════════════════════════════════════
//  CAMPUS PLACES: only the TYPE of place is listed here.
//  People type the actual name / number themselves (no made-up names).
//  Names that real users have typed before are offered as suggestions
//  (see knownPlaces() in js/frontend/core/utils.js).
// ═══════════════════════════════════════════════════════════════
const PLACE_TYPES = [
  { key: 'hostel', label: 'Hostel', icon: 'bed-double',
    nameLabel: 'Hostel name', namePlaceholder: 'Type the hostel name',
    spotLabel: 'Room number', spotPlaceholder: 'e.g. 214, or "common washroom, 2nd floor"', spotRequired: true },
  { key: 'classroom', label: 'Classroom', icon: 'presentation',
    nameLabel: 'Classroom / hall', namePlaceholder: 'Type the classroom number or name',
    spotLabel: 'Where in the room? (optional)', spotPlaceholder: 'e.g. near the projector' },
  { key: 'lab', label: 'Lab', icon: 'flask-conical',
    nameLabel: 'Lab name or number', namePlaceholder: 'e.g. Lab 8',
    spotLabel: 'System / bench number (optional)', spotPlaceholder: 'e.g. PC-23' },
  { key: 'office', label: 'Office / Department', icon: 'briefcase',
    nameLabel: 'Office or department', namePlaceholder: 'Type the office or department name',
    spotLabel: 'Room / cabin (optional)', spotPlaceholder: 'e.g. cabin number, floor' },
  { key: 'library', label: 'Library', icon: 'library',
    nameLabel: 'Which part of the library', namePlaceholder: 'e.g. reading area, front desk',
    spotLabel: 'Exact spot (optional)', spotPlaceholder: '' },
  { key: 'mess', label: 'Mess & Canteen', icon: 'utensils',
    nameLabel: 'Mess / canteen name', namePlaceholder: 'Type which mess or canteen',
    spotLabel: 'Exact spot (optional)', spotPlaceholder: 'e.g. wash area, counter' },
  { key: 'sports', label: 'Sports & Gym', icon: 'dumbbell',
    nameLabel: 'Ground / court / gym', namePlaceholder: 'Type which sports facility',
    spotLabel: 'Exact spot (optional)', spotPlaceholder: '' },
  { key: 'medical', label: 'Medical Centre', icon: 'heart-pulse',
    nameLabel: 'Which part', namePlaceholder: 'e.g. waiting area, pharmacy',
    spotLabel: 'Exact spot (optional)', spotPlaceholder: '' },
  { key: 'residential', label: 'Quarters & Guest House', icon: 'building',
    nameLabel: 'Block / building', namePlaceholder: 'Type the block or building name',
    spotLabel: 'House / room number', spotPlaceholder: 'e.g. flat or room number', spotRequired: true },
  { key: 'outdoor', label: 'Roads, Gates & Grounds', icon: 'trees',
    nameLabel: 'Which place', namePlaceholder: 'e.g. main gate, parking, campus road',
    spotLabel: 'Exact spot (optional)', spotPlaceholder: 'e.g. near the ATM' },
  { key: 'other', label: 'Other place', icon: 'pencil',
    nameLabel: 'Describe the place', namePlaceholder: 'e.g. behind the academic block, near the generator room',
    spotLabel: 'More detail (optional)', spotPlaceholder: '' },
];
function placeTypeByKey(key) { return PLACE_TYPES.find(t => t.key === key) || null; }



// ── helpers used across the app ──
const cleanIssue = s => String(s || '').replace(/^[!#*]+/, '');
const rawIssue = (cat, issue) => CATALOG[cat] ? CATALOG[cat].issues.find(r => cleanIssue(r) === issue) || '' : '';
function isUrgentIssue(cat, issue) { return /^[#*]*!/.test(rawIssue(cat, issue)); }
function isConfidentialIssue(cat, issue) { return /^[!*]*#/.test(rawIssue(cat, issue)); }
function isAreaWideIssue(cat, issue) { return /^[!#]*\*/.test(rawIssue(cat, issue)); }
function teamForCategory(cat) { return CATALOG[cat] ? CATALOG[cat].team : null; }
function materialsForCategory(cat) { return CATALOG[cat] ? CATALOG[cat].materials : []; }

// Older tickets used "Lab" for IT routing and different labels; keep them readable
window.CC_CATALOG = { TEAMS, CATALOG, cleanIssue, isUrgentIssue, isConfidentialIssue, isAreaWideIssue, teamForCategory };
