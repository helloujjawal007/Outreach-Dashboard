export interface StateConfig {
  name: string;
  defaultCity: string;
  cities: string[];
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  continent: string;
  defaultState: string;
  states: StateConfig[];
}

export interface ContinentConfig {
  id: string;
  name: string;
  flag: string;
  defaultCountry: string;
}

export const CONTINENTS: ContinentConfig[] = [
  { id: 'north_america', name: 'North America', flag: '🌎', defaultCountry: 'USA' },
  { id: 'europe', name: 'Europe', flag: '🌍', defaultCountry: 'United Kingdom' },
  { id: 'asia', name: 'Asia', flag: '🌏', defaultCountry: 'India' },
  { id: 'middle_east', name: 'Middle East', flag: '🕌', defaultCountry: 'United Arab Emirates' },
  { id: 'oceania', name: 'Oceania / Australia', flag: '🦘', defaultCountry: 'Australia' },
  { id: 'south_america', name: 'South America', flag: '🌎', defaultCountry: 'Brazil' },
  { id: 'africa', name: 'Africa', flag: '🌍', defaultCountry: 'South Africa' },
  { id: 'custom', name: 'Custom / Worldwide', flag: '🌐', defaultCountry: 'custom' },
];

export const POPULAR_CATEGORIES = [
  'Plumbing',
  'Dentist',
  'Real Estate',
  'Roofing Contractor',
  'HVAC & Cooling',
  'Lawyer',
  'Auto Repair',
  'Gym & Fitness',
  'Digital Marketing Agency',
  'Chiropractor',
  'Accounting & CPA',
  'Solar Energy',
  'Hair Salon & Spa',
  'Veterinarian',
];

export const COUNTRIES: CountryConfig[] = [
  // ================= NORTH AMERICA =================
  {
    code: 'USA',
    name: 'United States',
    flag: '🇺🇸',
    continent: 'north_america',
    defaultState: 'Texas',
    states: [
      {
        name: 'Texas',
        defaultCity: 'Austin',
        cities: [
          'Austin', 'Dallas', 'Houston', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano',
          'Corpus Christi', 'Lubbock', 'Laredo', 'Irving', 'Garland', 'Frisco', 'McKinney', 'Amarillo',
          'Grand Prairie', 'Brownsville', 'Killeen', 'Pasadena', 'Mesquite', 'McAllen', 'Denton', 'Waco', 'Midland', 'Carrollton'
        ],
      },
      {
        name: 'California',
        defaultCity: 'Los Angeles',
        cities: [
          'Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Oakland', 'Irvine',
          'Long Beach', 'Bakersfield', 'Anaheim', 'Santa Ana', 'Riverside', 'Stockton', 'Chula Vista', 'Fremont',
          'Modesto', 'San Bernardino', 'Glendale', 'Huntington Beach', 'Santa Clarita', 'Garden Grove', 'Santa Rosa', 'Oceanside', 'Pasadena'
        ],
      },
      {
        name: 'Florida',
        defaultCity: 'Miami',
        cities: [
          'Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Tallahassee', 'Sarasota',
          'Cape Coral', 'Pembroke Pines', 'Hollywood', 'Gainesville', 'Clearwater', 'Coral Springs', 'Palm Bay', 'Pompano Beach',
          'West Palm Beach', 'Lakeland', 'Boca Raton', 'Delray Beach', 'Daytona Beach', 'Fort Myers', 'Bradenton'
        ],
      },
      {
        name: 'New York',
        defaultCity: 'New York City',
        cities: [
          'New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Yonkers', 'New Rochelle', 'Mount Vernon',
          'Schenectady', 'Utica', 'White Plains', 'Hempstead', 'Brookhaven', 'Islip', 'Binghamton', 'Troy', 'Niagara Falls', 'Ithaca', 'Saratoga Springs'
        ],
      },
      {
        name: 'Illinois',
        defaultCity: 'Chicago',
        cities: [
          'Chicago', 'Naperville', 'Rockford', 'Aurora', 'Joliet', 'Peoria', 'Elgin', 'Waukegan', 'Cicero', 'Champaign',
          'Bloomington', 'Evanston', 'Arlington Heights', 'Schaumburg', 'Bolingbrook', 'Decatur', 'Springfield'
        ],
      },
      {
        name: 'Pennsylvania',
        defaultCity: 'Philadelphia',
        cities: [
          'Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton', 'Bethlehem', 'Lancaster',
          'Harrisburg', 'Altoona', 'York', 'State College', 'Wilkes-Barre', 'Norristown', 'Chester'
        ],
      },
      {
        name: 'Ohio',
        defaultCity: 'Columbus',
        cities: [
          'Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma', 'Canton',
          'Youngstown', 'Lorain', 'Hamilton', 'Springfield', 'Kettering', 'Elyria', 'Lakewood', 'Cuyahoga Falls'
        ],
      },
      {
        name: 'Georgia',
        defaultCity: 'Atlanta',
        cities: [
          'Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon', 'Athens', 'Sandy Springs', 'Roswell',
          'Johns Creek', 'Albany', 'Warner Robins', 'Alpharetta', 'Marietta', 'Valdosta', 'Smyrna', 'Dunwoody'
        ],
      },
      {
        name: 'North Carolina',
        defaultCity: 'Charlotte',
        cities: [
          'Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Cary', 'Wilmington',
          'High Point', 'Concord', 'Greenville', 'Asheville', 'Gastonia', 'Jacksonville', 'Chapel Hill', 'Burlington'
        ],
      },
      {
        name: 'Michigan',
        defaultCity: 'Detroit',
        cities: [
          'Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Sterling Heights', 'Warren', 'Flint', 'Dearborn',
          'Livonia', 'Troy', 'Westland', 'Farmington Hills', 'Kalamazoo', 'Wyoming', 'Southfield', 'Rochester Hills'
        ],
      },
      {
        name: 'Washington',
        defaultCity: 'Seattle',
        cities: [
          'Seattle', 'Bellevue', 'Spokane', 'Tacoma', 'Vancouver', 'Redmond', 'Everett', 'Kent',
          'Renton', 'Federal Way', 'Yakima', 'Kirkland', 'Bellingham', 'Kennewick', 'Auburn', 'Pasco'
        ],
      },
      {
        name: 'Arizona',
        defaultCity: 'Phoenix',
        cities: [
          'Phoenix', 'Scottsdale', 'Tucson', 'Mesa', 'Chandler', 'Gilbert', 'Glendale', 'Tempe',
          'Peoria', 'Surprise', 'Yuma', 'Avondale', 'Flagstaff', 'Goodyear', 'Lake Havasu City', 'Buckeye'
        ],
      },
      {
        name: 'Colorado',
        defaultCity: 'Denver',
        cities: [
          'Denver', 'Colorado Springs', 'Boulder', 'Aurora', 'Fort Collins', 'Lakewood', 'Thornton', 'Arvada',
          'Westminster', 'Pueblo', 'Centennial', 'Greeley', 'Longmont', 'Loveland', 'Broomfield', 'Grand Junction'
        ],
      },
      {
        name: 'Tennessee',
        defaultCity: 'Nashville',
        cities: [
          'Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville', 'Murfreesboro', 'Franklin', 'Johnson City',
          'Jackson', 'Hendersonville', 'Bartlett', 'Kingsport', 'Smyrna', 'Collierville', 'Cleveland', 'Brentwood'
        ],
      },
      {
        name: 'Nevada',
        defaultCity: 'Las Vegas',
        cities: [
          'Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks', 'Carson City', 'Fernley', 'Elko',
          'Mesquite', 'Boulder City', 'Fallon', 'Winnemucca', 'Pahrump'
        ],
      },
      {
        name: 'Virginia',
        defaultCity: 'Virginia Beach',
        cities: [
          'Virginia Beach', 'Richmond', 'Norfolk', 'Alexandria', 'Arlington', 'Chesapeake', 'Newport News', 'Hampton',
          'Roanoke', 'Portsmouth', 'Suffolk', 'Lynchburg', 'Harrisonburg', 'Charlottesville', 'Danville', 'Manassas'
        ],
      },
      {
        name: 'Massachusetts',
        defaultCity: 'Boston',
        cities: [
          'Boston', 'Worcester', 'Cambridge', 'Springfield', 'Lowell', 'Brockton', 'New Bedford', 'Quincy',
          'Lynn', 'Fall River', 'Newton', 'Lawrence', 'Somerville', 'Framingham', 'Haverhill', 'Waltham'
        ],
      },
      {
        name: 'New Jersey',
        defaultCity: 'Newark',
        cities: [
          'Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Princeton', 'Edison', 'Woodbridge', 'Lakewood',
          'Toms River', 'Hamilton', 'Trenton', 'Clifton', 'Camden', 'Cherry Hill', 'Passaic', 'Hoboken'
        ],
      },
      {
        name: 'Indiana',
        defaultCity: 'Indianapolis',
        cities: [
          'Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Fishers', 'Bloomington', 'Hammond',
          'Gary', 'Lafayette', 'Muncie', 'Terre Haute', 'Noblesville', 'Kokomo', 'Greenwood', 'Elkhart'
        ],
      },
      {
        name: 'Missouri',
        defaultCity: 'Kansas City',
        cities: [
          'Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence', 'Lee\'s Summit', 'O\'Fallon', 'St. Joseph',
          'St. Charles', 'St. Peters', 'Blue Springs', 'Florissant', 'Joplin', 'Chesterfield', 'Jefferson City'
        ],
      },
      {
        name: 'Maryland',
        defaultCity: 'Baltimore',
        cities: [
          'Baltimore', 'Frederick', 'Rockville', 'Gaithersburg', 'Bowie', 'Hagerstown', 'Annapolis', 'Salisbury',
          'College Park', 'Laurel', 'Greenbelt', 'Cumberland', 'Westminster', 'Hyattsville', 'Bethesda', 'Silver Spring'
        ],
      },
      {
        name: 'Wisconsin',
        defaultCity: 'Milwaukee',
        cities: [
          'Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine', 'Appleton', 'Waukesha', 'Oshkosh',
          'Eau Claire', 'Janesville', 'West Allis', 'La Crosse', 'Sheboygan', 'Wauwatosa', 'Fond du Lac'
        ],
      },
      {
        name: 'Minnesota',
        defaultCity: 'Minneapolis',
        cities: [
          'Minneapolis', 'St. Paul', 'Rochester', 'Bloomington', 'Duluth', 'Brooklyn Park', 'Plymouth', 'Woodbury',
          'Lakeville', 'St. Cloud', 'Eagan', 'Burnsville', 'Eden Prairie', 'Coon Rapids', 'Maple Grove'
        ],
      },
      {
        name: 'Oregon',
        defaultCity: 'Portland',
        cities: [
          'Portland', 'Eugene', 'Salem', 'Gresham', 'Hillsboro', 'Beaverton', 'Bend', 'Medford',
          'Springfield', 'Corvallis', 'Albany', 'Tigard', 'Lake Oswego', 'Keizer', 'Grants Pass'
        ],
      },
      {
        name: 'South Carolina',
        defaultCity: 'Charleston',
        cities: [
          'Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Rock Hill', 'Greenville', 'Summerville',
          'Goose Creek', 'Hilton Head Island', 'Spartanburg', 'Florence', 'Myrtle Beach', 'Greer', 'Aiken'
        ],
      },
      {
        name: 'Alabama',
        defaultCity: 'Huntsville',
        cities: [
          'Huntsville', 'Birmingham', 'Montgomery', 'Mobile', 'Tuscaloosa', 'Hoover', 'Auburn', 'Dothan',
          'Decatur', 'Madison', 'Florence', 'Phenix City', 'Prattville', 'Gadsden', 'Vestavia Hills'
        ],
      },
      {
        name: 'Louisiana',
        defaultCity: 'New Orleans',
        cities: [
          'New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles', 'Kenner', 'Bossier City',
          'Monroe', 'Alexandria', 'Houma', 'New Iberia', 'Slidell', 'Ruston', 'Sulphur', 'Hammond'
        ],
      },
      {
        name: 'Kentucky',
        defaultCity: 'Louisville',
        cities: [
          'Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington', 'Georgetown', 'Richmond',
          'Florence', 'Nicholasville', 'Hopkinsville', 'Independence', 'Frankfort', 'Henderson', 'Elizabethtown'
        ],
      },
      {
        name: 'Oklahoma',
        defaultCity: 'Oklahoma City',
        cities: [
          'Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond', 'Lawton', 'Moore', 'Midwest City',
          'Enid', 'Stillwater', 'Muskogee', 'Bartlesville', 'Owasso', 'Shawnee', 'Ponca City'
        ],
      },
      {
        name: 'Connecticut',
        defaultCity: 'Bridgeport',
        cities: [
          'Bridgeport', 'New Haven', 'Stamford', 'Hartford', 'Waterbury', 'Norwalk', 'Danbury', 'New Britain',
          'West Hartford', 'Greenwich', 'Hamden', 'Meriden', 'Bristol', 'Fairfield', 'Manchester'
        ],
      },
      {
        name: 'Utah',
        defaultCity: 'Salt Lake City',
        cities: [
          'Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem', 'Sandy', 'Ogden', 'St. George',
          'Layton', 'South Jordan', 'Lehi', 'Millcreek', 'Taylorsville', 'Logan', 'Murray', 'Draper'
        ],
      },
      {
        name: 'Iowa',
        defaultCity: 'Des Moines',
        cities: [
          'Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City', 'Iowa City', 'Waterloo', 'Ames',
          'West Des Moines', 'Ankeny', 'Council Bluffs', 'Dubuque', 'Urbandale', 'Cedar Falls', 'Marion'
        ],
      },
      {
        name: 'Kansas',
        defaultCity: 'Wichita',
        cities: [
          'Wichita', 'Overland Park', 'Kansas City', 'Olathe', 'Topeka', 'Lawrence', 'Shawnee',
          'Manhattan', 'Lenexa', 'Salina', 'Hutchinson', 'Leavenworth', 'Leawood', 'Dodge City'
        ],
      },
      {
        name: 'Arkansas',
        defaultCity: 'Little Rock',
        cities: [
          'Little Rock', 'Fayetteville', 'Fort Smith', 'Springdale', 'Jonesboro', 'Rogers', 'Conway',
          'North Little Rock', 'Bentonville', 'Pine Bluff', 'Hot Springs', 'Benton', 'Sherwood', 'Texarkana'
        ],
      },
      {
        name: 'Hawaii',
        defaultCity: 'Honolulu',
        cities: [
          'Honolulu', 'Hilo', 'Kailua', 'Kapolei', 'Kaneohe', 'Waipahu', 'Pearl City', 'Kahului', 'Kihei', 'Lihue', 'Lahaina'
        ],
      },
    ],
  },
  {
    code: 'Canada',
    name: 'Canada',
    flag: '🇨🇦',
    continent: 'north_america',
    defaultState: 'Ontario',
    states: [
      {
        name: 'Ontario',
        defaultCity: 'Toronto',
        cities: [
          'Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Vaughan',
          'Kitchener', 'Windsor', 'Richmond Hill', 'Oakville', 'Burlington', 'Greater Sudbury', 'Oshawa', 'Barrie', 'Kingston', 'Guelph'
        ],
      },
      {
        name: 'British Columbia',
        defaultCity: 'Vancouver',
        cities: [
          'Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Richmond', 'Kelowna', 'Abbotsford', 'Coquitlam',
          'Kamloops', 'Nanaimo', 'Langley', 'Chilliwack', 'Delta', 'North Vancouver', 'Maple Ridge'
        ],
      },
      {
        name: 'Alberta',
        defaultCity: 'Calgary',
        cities: [
          'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Medicine Hat', 'Grande Prairie',
          'Airdrie', 'Spruce Grove', 'Leduc', 'Fort McMurray', 'Cochrane', 'Okotoks'
        ],
      },
      {
        name: 'Quebec',
        defaultCity: 'Montreal',
        cities: [
          'Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil', 'Sherbrooke', 'Saguenay', 'Levis',
          'Trois-Rivieres', 'Terrebonne', 'Saint-Jean-sur-Richelieu', 'Repentigny', 'Brossard'
        ],
      },
      {
        name: 'Saskatchewan',
        defaultCity: 'Saskatoon',
        cities: [
          'Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Swift Current', 'Yorkton', 'North Battleford', 'Estevan', 'Weyburn', 'Lloydminster'
        ],
      },
      {
        name: 'Manitoba',
        defaultCity: 'Winnipeg',
        cities: [
          'Winnipeg', 'Brandon', 'Steinbach', 'Thompson', 'Portage la Prairie', 'Winkler', 'Selkirk', 'Morden', 'Dauphin'
        ],
      },
      {
        name: 'Nova Scotia',
        defaultCity: 'Halifax',
        cities: [
          'Halifax', 'Dartmouth', 'Sydney', 'Truro', 'New Glasgow', 'Glace Bay', 'Kentville', 'Amherst', 'Bridgewater'
        ],
      },
      {
        name: 'New Brunswick',
        defaultCity: 'Moncton',
        cities: [
          'Moncton', 'Saint John', 'Fredericton', 'Dieppe', 'Miramichi', 'Edmundston', 'Bathurst', 'Campbellton'
        ],
      },
    ],
  },
  {
    code: 'Mexico',
    name: 'Mexico',
    flag: '🇲🇽',
    continent: 'north_america',
    defaultState: 'Mexico City',
    states: [
      {
        name: 'Mexico City',
        defaultCity: 'Mexico City',
        cities: ['Mexico City', 'Polanco', 'Coyoacán', 'Benito Juárez', 'Cuauhtémoc', 'Santa Fe', 'Tlalpan'],
      },
      {
        name: 'Jalisco',
        defaultCity: 'Guadalajara',
        cities: ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Puerto Vallarta', 'Tonalá', 'Tlajomulco'],
      },
      {
        name: 'Nuevo León',
        defaultCity: 'Monterrey',
        cities: ['Monterrey', 'San Pedro Garza García', 'San Nicolás', 'Guadalupe', 'Apodaca', 'Santa Catarina'],
      },
      {
        name: 'Puebla',
        defaultCity: 'Puebla',
        cities: ['Puebla', 'Cholula', 'Tehuacán', 'Atlixco', 'San Martín Texmelucan'],
      },
      {
        name: 'Quintana Roo',
        defaultCity: 'Cancún',
        cities: ['Cancún', 'Playa del Carmen', 'Tulum', 'Cozumel', 'Chetumal'],
      },
      {
        name: 'Yucatán',
        defaultCity: 'Mérida',
        cities: ['Mérida', 'Valladolid', 'Progreso', 'Tizimín', 'Kanasín'],
      },
      {
        name: 'Baja California',
        defaultCity: 'Tijuana',
        cities: ['Tijuana', 'Mexicali', 'Ensenada', 'Rosarito', 'Tecate'],
      },
    ],
  },

  // ================= EUROPE =================
  {
    code: 'United Kingdom',
    name: 'United Kingdom',
    flag: '🇬🇧',
    continent: 'europe',
    defaultState: 'Greater London',
    states: [
      {
        name: 'Greater London',
        defaultCity: 'Central London',
        cities: [
          'Central London', 'Westminster', 'City of London', 'Camden', 'Islington', 'Kensington & Chelsea',
          'Greenwich', 'Croydon', 'Bromley', 'Barnet', 'Ealing', 'Richmond', 'Southwark', 'Tower Hamlets', 'Hackney'
        ],
      },
      {
        name: 'West Midlands',
        defaultCity: 'Birmingham',
        cities: ['Birmingham', 'Coventry', 'Wolverhampton', 'Solihull', 'Dudley', 'Walsall', 'West Bromwich', 'Stourbridge'],
      },
      {
        name: 'Greater Manchester',
        defaultCity: 'Manchester',
        cities: ['Manchester', 'Salford', 'Bolton', 'Stockport', 'Oldham', 'Rochdale', 'Wigan', 'Bury', 'Trafford'],
      },
      {
        name: 'West Yorkshire',
        defaultCity: 'Leeds',
        cities: ['Leeds', 'Bradford', 'Wakefield', 'Huddersfield', 'Halifax', 'Keighley', 'Dewsbury'],
      },
      {
        name: 'Scotland',
        defaultCity: 'Glasgow',
        cities: ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Paisley', 'East Kilbride', 'Inverness', 'Stirling', 'Perth'],
      },
      {
        name: 'Wales',
        defaultCity: 'Cardiff',
        cities: ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry', 'Neath', 'Bridgend', 'Llanelli'],
      },
      {
        name: 'Merseyside',
        defaultCity: 'Liverpool',
        cities: ['Liverpool', 'Birkenhead', 'St Helens', 'Southport', 'Wallasey', 'Bootle', 'Crosby'],
      },
      {
        name: 'South Yorkshire',
        defaultCity: 'Sheffield',
        cities: ['Sheffield', 'Doncaster', 'Rotherham', 'Barnsley', 'Wath upon Dearne'],
      },
      {
        name: 'Hampshire',
        defaultCity: 'Southampton',
        cities: ['Southampton', 'Portsmouth', 'Winchester', 'Basingstoke', 'Eastleigh', 'Gosport', 'Farnborough'],
      },
      {
        name: 'Bristol & South West',
        defaultCity: 'Bristol',
        cities: ['Bristol', 'Bath', 'Weston-super-Mare', 'Gloucester', 'Cheltenham', 'Swindon', 'Exeter', 'Plymouth'],
      },
    ],
  },
  {
    code: 'Germany',
    name: 'Germany',
    flag: '🇩🇪',
    continent: 'europe',
    defaultState: 'Bavaria',
    states: [
      {
        name: 'Bavaria',
        defaultCity: 'Munich',
        cities: ['Munich', 'Nuremberg', 'Augsburg', 'Regensburg', 'Ingolstadt', 'Würzburg', 'Erlangen', 'Bamberg'],
      },
      {
        name: 'Berlin',
        defaultCity: 'Berlin Mitte',
        cities: ['Berlin Mitte', 'Charlottenburg', 'Kreuzberg', 'Pankow', 'Neukölln', 'Friedrichshain', 'Spandau'],
      },
      {
        name: 'North Rhine-Westphalia',
        defaultCity: 'Cologne',
        cities: ['Cologne', 'Düsseldorf', 'Dortmund', 'Essen', 'Bonn', 'Münster', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld'],
      },
      {
        name: 'Baden-Württemberg',
        defaultCity: 'Stuttgart',
        cities: ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg', 'Heidelberg', 'Heilbronn', 'Ulm', 'Pforzheim'],
      },
      {
        name: 'Hesse',
        defaultCity: 'Frankfurt am Main',
        cities: ['Frankfurt am Main', 'Wiesbaden', 'Kassel', 'Darmstadt', 'Offenbach', 'Hanau', 'Marburg', 'Giessen'],
      },
      {
        name: 'Hamburg',
        defaultCity: 'Hamburg',
        cities: ['Hamburg', 'Altona', 'Harburg', 'Wandsbek', 'Bergedorf', 'Eimsbüttel'],
      },
    ],
  },
  {
    code: 'France',
    name: 'France',
    flag: '🇫🇷',
    continent: 'europe',
    defaultState: 'Île-de-France',
    states: [
      {
        name: 'Île-de-France',
        defaultCity: 'Paris',
        cities: ['Paris', 'Boulogne-Billancourt', 'Saint-Denis', 'Versailles', 'Nanterre', 'Créteil', 'Courbevoie', 'Argenteuil'],
      },
      {
        name: 'Auvergne-Rhône-Alpes',
        defaultCity: 'Lyon',
        cities: ['Lyon', 'Grenoble', 'Saint-Étienne', 'Annecy', 'Clermont-Ferrand', 'Chambéry', 'Valence', 'Villeurbanne'],
      },
      {
        name: 'Provence-Alpes-Côte d\'Azur',
        defaultCity: 'Marseille',
        cities: ['Marseille', 'Nice', 'Cannes', 'Toulon', 'Aix-en-Provence', 'Avignon', 'Antibes'],
      },
      {
        name: 'Occitanie',
        defaultCity: 'Toulouse',
        cities: ['Toulouse', 'Montpellier', 'Nîmes', 'Perpignan', 'Béziers', 'Montauban', 'Tarbes'],
      },
    ],
  },
  {
    code: 'Spain',
    name: 'Spain',
    flag: '🇪🇸',
    continent: 'europe',
    defaultState: 'Madrid',
    states: [
      {
        name: 'Madrid',
        defaultCity: 'Madrid',
        cities: ['Madrid', 'Móstoles', 'Alcalá de Henares', 'Leganés', 'Getafe', 'Alcorcón', 'Fuenlabrada', 'Pozuelo'],
      },
      {
        name: 'Catalonia',
        defaultCity: 'Barcelona',
        cities: ['Barcelona', 'L\'Hospitalet', 'Badalona', 'Terrassa', 'Sabadell', 'Girona', 'Tarragona', 'Lleida'],
      },
      {
        name: 'Andalusia',
        defaultCity: 'Seville',
        cities: ['Seville', 'Málaga', 'Córdoba', 'Granada', 'Marbella', 'Jerez de la Frontera', 'Almería', 'Cádiz'],
      },
      {
        name: 'Valencia',
        defaultCity: 'Valencia',
        cities: ['Valencia', 'Alicante', 'Elche', 'Castellón', 'Torrevieja', 'Gandía', 'Benidorm'],
      },
    ],
  },
  {
    code: 'Italy',
    name: 'Italy',
    flag: '🇮🇹',
    continent: 'europe',
    defaultState: 'Lombardy',
    states: [
      {
        name: 'Lombardy',
        defaultCity: 'Milan',
        cities: ['Milan', 'Brescia', 'Monza', 'Bergamo', 'Como', 'Varese', 'Pavia', 'Cremona'],
      },
      {
        name: 'Lazio',
        defaultCity: 'Rome',
        cities: ['Rome', 'Latina', 'Fiumicino', 'Viterbo', 'Tivoli', 'Civitavecchia', 'Pomezia'],
      },
      {
        name: 'Campania',
        defaultCity: 'Naples',
        cities: ['Naples', 'Salerno', 'Giugliano', 'Caserta', 'Castellammare di Stabia', 'Aversa'],
      },
      {
        name: 'Veneto',
        defaultCity: 'Venice',
        cities: ['Venice', 'Verona', 'Padua', 'Vicenza', 'Treviso', 'Rovigo', 'Chioggia'],
      },
    ],
  },
  {
    code: 'Netherlands',
    name: 'Netherlands',
    flag: '🇳🇱',
    continent: 'europe',
    defaultState: 'North Holland',
    states: [
      {
        name: 'North Holland',
        defaultCity: 'Amsterdam',
        cities: ['Amsterdam', 'Haarlem', 'Hilversum', 'Alkmaar', 'Zaandam', 'Amstelveen', 'Hoorn'],
      },
      {
        name: 'South Holland',
        defaultCity: 'Rotterdam',
        cities: ['Rotterdam', 'The Hague', 'Leiden', 'Delft', 'Dordrecht', 'Zoetermeer', 'Gouda'],
      },
      {
        name: 'Utrecht',
        defaultCity: 'Utrecht',
        cities: ['Utrecht', 'Amersfoort', 'Veenendaal', 'Zeist', 'Nieuwegein', 'Woerden'],
      },
      {
        name: 'North Brabant',
        defaultCity: 'Eindhoven',
        cities: ['Eindhoven', 'Tilburg', 'Breda', 'Den Bosch', 'Helmond', 'Roosendaal'],
      },
    ],
  },
  {
    code: 'Ireland',
    name: 'Ireland',
    flag: '🇮🇪',
    continent: 'europe',
    defaultState: 'Leinster',
    states: [
      {
        name: 'Leinster',
        defaultCity: 'Dublin',
        cities: ['Dublin', 'Dún Laoghaire', 'Swords', 'Dundalk', 'Bray', 'Navan', 'Kilkenny', 'Drogheda'],
      },
      {
        name: 'Munster',
        defaultCity: 'Cork',
        cities: ['Cork', 'Limerick', 'Waterford', 'Tralee', 'Killarney', 'Ennis', 'Clonmel'],
      },
      {
        name: 'Connacht',
        defaultCity: 'Galway',
        cities: ['Galway', 'Sligo', 'Castlebar', 'Ballina', 'Roscommon', 'Tuam'],
      },
    ],
  },
  {
    code: 'Austria',
    name: 'Austria',
    flag: '🇦🇹',
    continent: 'europe',
    defaultState: 'Vienna',
    states: [
      {
        name: 'Vienna',
        defaultCity: 'Vienna',
        cities: ['Vienna', 'Innere Stadt', 'Donaustadt', 'Floridsdorf', 'Favoriten', 'Ottakring', 'Leopoldstadt'],
      },
      {
        name: 'Upper Austria',
        defaultCity: 'Linz',
        cities: ['Linz', 'Wels', 'Steyr', 'Traun', 'Enns', 'Vöcklabruck'],
      },
      {
        name: 'Styria',
        defaultCity: 'Graz',
        cities: ['Graz', 'Leoben', 'Kapfenberg', 'Bruck an der Mur', 'Feldbach'],
      },
      {
        name: 'Salzburg',
        defaultCity: 'Salzburg',
        cities: ['Salzburg', 'Hallein', 'Saalfelden', 'Sankt Johann', 'Bischofshofen'],
      },
    ],
  },
  {
    code: 'Switzerland',
    name: 'Switzerland',
    flag: '🇨🇭',
    continent: 'europe',
    defaultState: 'Zurich',
    states: [
      {
        name: 'Zurich',
        defaultCity: 'Zurich',
        cities: ['Zurich', 'Winterthur', 'Uster', 'Dübendorf', 'Dietikon', 'Wetzikon'],
      },
      {
        name: 'Geneva',
        defaultCity: 'Geneva',
        cities: ['Geneva', 'Vernier', 'Lancy', 'Meyrin', 'Carouge', 'Thônex'],
      },
      {
        name: 'Vaud',
        defaultCity: 'Lausanne',
        cities: ['Lausanne', 'Yverdon-les-Bains', 'Montreux', 'Renens', 'Nyon', 'Vevey'],
      },
      {
        name: 'Basel-Stadt',
        defaultCity: 'Basel',
        cities: ['Basel', 'Riehen', 'Bettingen', 'Allschwil', 'Muttenz'],
      },
    ],
  },

  // ================= ASIA =================
  {
    code: 'India',
    name: 'India',
    flag: '🇮🇳',
    continent: 'asia',
    defaultState: 'Maharashtra',
    states: [
      {
        name: 'Maharashtra',
        defaultCity: 'Mumbai',
        cities: [
          'Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Navi Mumbai', 'Solapur',
          'Kolhapur', 'Kalyan', 'Amravati', 'Nanded', 'Jalgaon', 'Akola', 'Panvel'
        ],
      },
      {
        name: 'Karnataka',
        defaultCity: 'Bengaluru',
        cities: [
          'Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari',
          'Shimoga', 'Tumakuru', 'Udupi', 'Bidar', 'Hassan'
        ],
      },
      {
        name: 'Delhi NCR',
        defaultCity: 'New Delhi',
        cities: [
          'New Delhi', 'Gurgaon', 'Noida', 'Greater Noida', 'Faridabad', 'Ghaziabad', 'South Delhi', 'Dwarka', 'Rohini'
        ],
      },
      {
        name: 'Tamil Nadu',
        defaultCity: 'Chennai',
        cities: [
          'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur',
          'Erode', 'Vellore', 'Thoothukudi', 'Thanjavur', 'Dindigul'
        ],
      },
      {
        name: 'Telangana',
        defaultCity: 'Hyderabad',
        cities: [
          'Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Ramagundam', 'Khammam', 'Mahbubnagar', 'Secunderabad'
        ],
      },
      {
        name: 'Gujarat',
        defaultCity: 'Ahmedabad',
        cities: [
          'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Navsari'
        ],
      },
      {
        name: 'Uttar Pradesh',
        defaultCity: 'Lucknow',
        cities: [
          'Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Prayagraj', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur'
        ],
      },
      {
        name: 'West Bengal',
        defaultCity: 'Kolkata',
        cities: [
          'Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol', 'Bardhaman', 'Malda', 'Kharagpur', 'Haldia'
        ],
      },
      {
        name: 'Rajasthan',
        defaultCity: 'Jaipur',
        cities: [
          'Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Sikar', 'Sri Ganganagar'
        ],
      },
      {
        name: 'Punjab',
        defaultCity: 'Ludhiana',
        cities: [
          'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali', 'Bathinda', 'Hoshiarpur', 'Pathankot', 'Moga'
        ],
      },
    ],
  },
  {
    code: 'Singapore',
    name: 'Singapore',
    flag: '🇸🇬',
    continent: 'asia',
    defaultState: 'Central Region',
    states: [
      {
        name: 'Central Region',
        defaultCity: 'Singapore Downtown',
        cities: ['Singapore Downtown', 'Orchard', 'Marina Bay', 'Novena', 'Tanjong Pagar', 'Bukit Timah', 'Bishan', 'Toa Payoh'],
      },
      {
        name: 'East Region',
        defaultCity: 'Tampines',
        cities: ['Tampines', 'Bedok', 'Pasir Ris', 'Changi', 'Marine Parade'],
      },
      {
        name: 'West Region',
        defaultCity: 'Jurong East',
        cities: ['Jurong East', 'Clementi', 'Bukit Batok', 'Pioneer', 'Choa Chu Kang', 'Boon Lay'],
      },
    ],
  },
  {
    code: 'Japan',
    name: 'Japan',
    flag: '🇯🇵',
    continent: 'asia',
    defaultState: 'Tokyo',
    states: [
      {
        name: 'Tokyo',
        defaultCity: 'Shinjuku',
        cities: ['Shinjuku', 'Shibuya', 'Chiyoda', 'Minato', 'Chuo', 'Setagaya', 'Roppongi', 'Ginza'],
      },
      {
        name: 'Osaka',
        defaultCity: 'Osaka City',
        cities: ['Osaka City', 'Sakai', 'Higashiosaka', 'Toyonaka', 'Hirakata', 'Suita'],
      },
      {
        name: 'Kanagawa',
        defaultCity: 'Yokohama',
        cities: ['Yokohama', 'Kawasaki', 'Sagamihara', 'Fujisawa', 'Kamakura'],
      },
    ],
  },

  // ================= MIDDLE EAST =================
  {
    code: 'United Arab Emirates',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    continent: 'middle_east',
    defaultState: 'Dubai',
    states: [
      {
        name: 'Dubai',
        defaultCity: 'Downtown Dubai',
        cities: [
          'Downtown Dubai', 'Dubai Marina', 'Business Bay', 'Deira', 'Bur Dubai', 'Jumeirah',
          'Al Barsha', 'Palm Jumeirah', 'Jumeirah Lake Towers (JLT)', 'Al Quoz', 'Dubai Hills', 'Silicon Oasis'
        ],
      },
      {
        name: 'Abu Dhabi',
        defaultCity: 'Abu Dhabi City',
        cities: [
          'Abu Dhabi City', 'Al Ain', 'Al Dhafra', 'Yas Island', 'Saadiyat Island', 'Khalifa City', 'Al Reem Island', 'Musaffah'
        ],
      },
      {
        name: 'Sharjah',
        defaultCity: 'Sharjah City',
        cities: ['Sharjah City', 'Al Majaz', 'Al Nahda', 'Muwaileh', 'Al Qasimia', 'Khor Fakkan'],
      },
      {
        name: 'Ajman',
        defaultCity: 'Ajman City',
        cities: ['Ajman City', 'Al Nuaimiya', 'Al Rashidiya', 'Al Jurf', 'Al Rawda'],
      },
      {
        name: 'Ras Al Khaimah',
        defaultCity: 'RAK City',
        cities: ['RAK City', 'Al Hamra', 'Al Marjan Island', 'Al Nakheel', 'Khuzam'],
      },
    ],
  },
  {
    code: 'Saudi Arabia',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    continent: 'middle_east',
    defaultState: 'Riyadh Province',
    states: [
      {
        name: 'Riyadh Province',
        defaultCity: 'Riyadh City',
        cities: ['Riyadh City', 'Al Olaya', 'Al Malaz', 'Al Nakheel', 'Al Yasmin', 'Al Kharj'],
      },
      {
        name: 'Makkah Province',
        defaultCity: 'Jeddah',
        cities: ['Jeddah', 'Mecca', 'Taif', 'Rabigh', 'Al Qunfudhah'],
      },
      {
        name: 'Eastern Province',
        defaultCity: 'Dammam',
        cities: ['Dammam', 'Khobar', 'Dhahran', 'Jubail', 'Al Ahsa', 'Qatif'],
      },
    ],
  },

  // ================= OCEANIA =================
  {
    code: 'Australia',
    name: 'Australia',
    flag: '🇦🇺',
    continent: 'oceania',
    defaultState: 'New South Wales',
    states: [
      {
        name: 'New South Wales',
        defaultCity: 'Sydney',
        cities: [
          'Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Parramatta', 'Blacktown', 'Penrith',
          'Dubbo', 'Albury', 'Wagga Wagga', 'Coffs Harbour', 'Port Macquarie', 'Tamworth', 'Orange'
        ],
      },
      {
        name: 'Victoria',
        defaultCity: 'Melbourne',
        cities: [
          'Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton', 'Frankston', 'Dandenong',
          'Mildura', 'Warrnambool', 'Traralgon', 'Wodonga'
        ],
      },
      {
        name: 'Queensland',
        defaultCity: 'Brisbane',
        cities: [
          'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Cairns', 'Townsville', 'Toowoomba',
          'Mackay', 'Rockhampton', 'Bundaberg', 'Hervey Bay', 'Gladstone'
        ],
      },
      {
        name: 'Western Australia',
        defaultCity: 'Perth',
        cities: ['Perth', 'Fremantle', 'Mandurah', 'Bunbury', 'Geraldton', 'Kalgoorlie', 'Albany', 'Busselton', 'Broome'],
      },
      {
        name: 'South Australia',
        defaultCity: 'Adelaide',
        cities: ['Adelaide', 'Mount Gambier', 'Gawler', 'Whyalla', 'Murray Bridge', 'Mount Barker', 'Victor Harbor', 'Port Lincoln'],
      },
    ],
  },
  {
    code: 'New Zealand',
    name: 'New Zealand',
    flag: '🇳🇿',
    continent: 'oceania',
    defaultState: 'Auckland Region',
    states: [
      {
        name: 'Auckland Region',
        defaultCity: 'Auckland Central',
        cities: ['Auckland Central', 'North Shore', 'Manukau', 'Waitakere', 'Takapuna', 'Ponsonby'],
      },
      {
        name: 'Wellington Region',
        defaultCity: 'Wellington City',
        cities: ['Wellington City', 'Lower Hutt', 'Porirua', 'Upper Hutt', 'Kapiti Coast'],
      },
      {
        name: 'Canterbury',
        defaultCity: 'Christchurch',
        cities: ['Christchurch', 'Timaru', 'Ashburton', 'Rangiora', 'Rolleston'],
      },
    ],
  },
];
