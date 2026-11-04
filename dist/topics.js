/* KSSM topic library for homework records: subject (MM / AM / SC) × level (F1–F5), Malay / English.
   Chapter lists checked against Pandai's KSSM course indexes (Nov 2026); F1 follows the 2026 textbook list
   from tabung.my and is flagged for the teacher to confirm. Teachers can override any list in Settings. */
(root=>{
  'use strict';
  const T={
    MM:{
      F1:[['Nombor Nisbah','Rational Numbers'],['Faktor dan Gandaan','Factors and Multiples'],['Kuasa Dua, Punca Kuasa Dua, Kuasa Tiga dan Punca Kuasa Tiga','Squares, Square Roots, Cubes and Cube Roots'],['Nisbah, Kadar dan Kadaran','Ratios, Rates and Proportions'],['Ungkapan Algebra','Algebraic Expressions'],['Persamaan Linear','Linear Equations'],['Ketaksamaan Linear','Linear Inequalities'],['Garis dan Sudut','Lines and Angles'],['Poligon Asas','Basic Polygons'],['Perimeter dan Luas','Perimeter and Area'],['Pengenalan Set','Introduction to Sets'],['Pengendalian Data','Data Handling']],
      F2:[['Pola dan Jujukan','Patterns and Sequences'],['Pemfaktoran dan Pecahan Algebra','Factorisation and Algebraic Fractions'],['Rumus Algebra','Algebraic Formulae'],['Poligon','Polygons'],['Bulatan','Circles'],['Bentuk Geometri Tiga Dimensi','Three-Dimensional Geometrical Shapes'],['Koordinat','Coordinates'],['Graf Fungsi','Graphs of Functions'],['Laju dan Pecutan','Speed and Acceleration'],['Kecerunan Garis Lurus','Gradient of a Straight Line'],['Transformasi Isometri','Isometric Transformations'],['Sukatan Kecenderungan Memusat','Measures of Central Tendencies'],['Kebarangkalian Mudah','Simple Probability']],
      F3:[['Indeks','Indices'],['Bentuk Piawai','Standard Form'],['Matematik Pengguna: Simpanan dan Pelaburan, Kredit dan Hutang','Consumer Mathematics: Savings and Investments, Credit and Debt'],['Lukisan Berskala','Scale Drawings'],['Nisbah Trigonometri','Trigonometric Ratios'],['Sudut dan Tangen bagi Bulatan','Angles and Tangents of Circles'],['Pelan dan Dongakan','Plans and Elevations'],['Lokus dalam Dua Dimensi','Loci in Two Dimensions'],['Garis Lurus','Straight Lines']],
      F4:[['Fungsi dan Persamaan Kuadratik dalam Satu Pemboleh Ubah','Quadratic Functions and Equations in One Variable'],['Asas Nombor','Number Bases'],['Penaakulan Logik','Logical Reasoning'],['Operasi Set','Operations on Sets'],['Rangkaian dalam Teori Graf','Network in Graph Theory'],['Ketaksamaan Linear dalam Dua Pemboleh Ubah','Linear Inequalities in Two Variables'],['Graf Gerakan','Graphs of Motion'],['Sukatan Serakan Data Tak Terkumpul','Measures of Dispersion for Ungrouped Data'],['Kebarangkalian Peristiwa Bergabung','Probability of Combined Events'],['Matematik Pengguna: Pengurusan Kewangan','Consumer Mathematics: Financial Management']],
      F5:[['Ubahan','Variation'],['Matriks','Matrices'],['Matematik Pengguna: Insurans','Consumer Mathematics: Insurance'],['Matematik Pengguna: Percukaian','Consumer Mathematics: Taxation'],['Kekongruenan, Pembesaran dan Gabungan Transformasi','Congruency, Enlargement and Combined Transformations'],['Nisbah dan Graf Fungsi Trigonometri','Ratios and Graphs of Trigonometric Functions'],['Sukatan Serakan Data Terkumpul','Measures of Dispersion for Grouped Data'],['Pemodelan Matematik','Mathematical Modeling']]
    },
    AM:{
      F4:[['Fungsi','Functions'],['Fungsi Kuadratik','Quadratic Functions'],['Sistem Persamaan','Systems of Equations'],['Indeks, Surd dan Logaritma','Indices, Surds and Logarithms'],['Janjang','Progressions'],['Hukum Linear','Linear Law'],['Geometri Koordinat','Coordinate Geometry'],['Vektor','Vectors'],['Penyelesaian Segi Tiga','Solution of Triangles'],['Nombor Indeks','Index Numbers']],
      F5:[['Sukatan Membulat','Circular Measure'],['Pembezaan','Differentiation'],['Pengamiran','Integration'],['Pilih Atur dan Gabungan','Permutation and Combination'],['Taburan Kebarangkalian','Probability Distribution'],['Fungsi Trigonometri','Trigonometric Functions'],['Pengaturcaraan Linear','Linear Programming'],['Kinematik Gerakan Linear','Kinematics of Linear Motion']]
    },
    SC:{
      F1:[['Pengenalan kepada Sains','Introduction to Science'],['Sel sebagai Unit Kehidupan','Cell as the Unit of Life'],['Koordinasi dan Gerak Balas','Coordination and Response'],['Jirim','Matter'],['Unsur, Sebatian dan Campuran','Elements, Compounds and Mixtures'],['Tenaga','Energy'],['Haba','Heat'],['Bunyi','Sound'],['Cahaya dan Optik','Light and Optics'],['Bumi','Earth']],
      F2:[['Biodiversiti','Biodiversity'],['Ekosistem','Ecosystem'],['Nutrisi','Nutrition'],['Kesihatan Manusia','Human Health'],['Air dan Larutan','Water and Solution'],['Asid dan Alkali','Acids and Alkalis'],['Keelektrikan dan Kemagnetan','Electricity and Magnetism'],['Daya dan Gerakan','Force and Motion'],['Haba','Heat'],['Gelombang Bunyi','Sound Waves'],['Bintang dan Galaksi dalam Alam Semesta','Stars and Galaxies in the Universe'],['Sistem Suria','Solar System'],['Meteoroid, Asteroid, Komet','Meteoroid, Asteroid, Comet']],
      F3:[['Rangsangan dan Gerak Balas','Stimuli and Responses'],['Respirasi','Respiration'],['Pengangkutan','Transportation'],['Kereaktifan Logam','Reactivity of Metals'],['Termokimia','Thermochemistry'],['Elektrik dan Kemagnetan','Electricity and Magnetism'],['Tenaga dan Kuasa','Energy and Power'],['Keradioaktifan','Radioactivity'],['Cuaca Angkasa Lepas','Space Weather'],['Penerokaan Angkasa Lepas','Space Exploration']],
      F4:[['Langkah Keselamatan di dalam Makmal','Safety Measures in the Laboratory'],['Bantuan Kecemasan','Emergency Help'],['Teknik Mengukur Parameter Kesihatan Tubuh Badan','Techniques of Measuring the Parameters of Body Health'],['Teknologi Hijau untuk Kelestarian Alam Sekitar','Green Technology for Environmental Sustainability'],['Genetik','Genetics'],['Sokongan, Pergerakan dan Pertumbuhan','Support, Movement and Growth'],['Koordinasi Badan','Body Coordination'],['Unsur dan Bahan','Elements and Substances'],['Bahan Kimia dalam Perindustrian','Chemicals in Industry'],['Bahan Kimia dalam Perubatan dan Kesihatan','Chemicals in Medicine and Health'],['Daya dan Gerakan','Force and Motion'],['Tenaga Nuklear','Nuclear Energy']],
      F5:[['Mikroorganisma','Microorganisms'],['Nutrisi dan Teknologi Makanan','Nutrition and Food Technology'],['Kelestarian Alam Sekitar','Sustainability of the Environment'],['Kadar Tindak Balas','Rate of Reaction'],['Sebatian Karbon','Carbon Compounds'],['Elektrokimia','Electrochemistry'],['Cahaya dan Optik','Light and Optics'],['Daya dan Tekanan','Force and Pressure'],['Teknologi Angkasa Lepas','Space Technology']]
    }
  };
  const SUBJECTS=[['MM','Mathematics / Matematik'],['AM','Additional Mathematics / Matematik Tambahan'],['SC','Science / Sains']];
  const LEVELS=['F1','F2','F3','F4','F5'];
  const UNVERIFIED=new Set(['MM|F1','SC|F1']);
  /* Read the subject from what the teacher typed: "AM", "Add Maths", "附加数学", "MM SA", "Science"… */
  function subjectCode(text){
    const s=` ${String(text||'').toUpperCase()} `;
    if(/[^A-Z]AM[^A-Z]|ADD(ITIONAL)?\.? ?MATH|MATEMATIK TAMBAHAN|附加数学|高数/.test(s))return 'AM';
    if(/[^A-Z](SC|SCI)[^A-Z]|SCIENCE|SAINS|科学/.test(s))return 'SC';
    if(/[^A-Z](MM|MT)[^A-Z]|MATH|MATEMATIK|数学/.test(s))return 'MM';
    return '';
  }
  /* "F3", "Form 3", "Tingkatan 3", "T3", "中三" → "F3". */
  function levelCode(text){
    const s=String(text||'').trim().toUpperCase(),cn={'一':1,'二':2,'三':3,'四':4,'五':5};
    let m=s.match(/^(?:F|FORM|T|TINGKATAN)\s*([1-5])$/);if(m)return `F${m[1]}`;
    m=s.match(/^中([一二三四五])$/);if(m)return `F${cn[m[1]]}`;
    return '';
  }
  const keyFor=c=>{const subj=subjectCode(`${c?.subject||''} ${c?.name||''}`),lv=levelCode(c?.grade);return subj&&lv?`${subj}|${lv}`:'';};
  const builtIn=key=>{const [subj,lv]=key.split('|');return (T[subj]?.[lv]||[]).map(([bm,en],i)=>`${i+1}. ${bm} / ${en}`);};
  /* The list the teacher sees: their own edited list if they saved one, otherwise the built-in KSSM list. */
  function list(data,key){if(!key)return [];const own=data?.topicLibrary?.[key];return Array.isArray(own)?own.slice():builtIn(key);}
  function save(data,key,lines){
    if(!/^(MM|AM|SC)\|F[1-5]$/.test(key))throw Error('科目或年级不对 / Invalid subject or level');
    const clean=[...new Set(lines.map(l=>String(l||'').trim()).filter(Boolean))].map(l=>l.slice(0,120));
    data.topicLibrary??={};
    if(JSON.stringify(clean)===JSON.stringify(builtIn(key)))delete data.topicLibrary[key];else data.topicLibrary[key]=clean;
    return clean;
  }
  const api={subjectCode,levelCode,keyFor,builtIn,list,save,SUBJECTS,LEVELS,isUnverified:key=>UNVERIFIED.has(key)};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LumiTopics=api;
})(globalThis);
