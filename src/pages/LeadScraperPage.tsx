import { useState, useMemo } from 'react';
import {
  Compass,
  Search,
  Globe,
  Mail,
  Phone,
  MapPin,
  Star,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Loader2,
  Filter,
  Download,
  Check,
  RefreshCw,
  X,
  Sparkles,
  UserPlus,
  Layers,
  Building2,
  Instagram,
  Facebook,
  Linkedin,
  Sliders,
  Edit3,
} from 'lucide-react';
import { PageHeader, type PageId } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/services/api';
import type { Store } from '@/store';
import type { ScrapedLead } from '@/types';

interface Props {
  store: Store;
  onNavigate?: (page: PageId) => void;
}

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

export const COUNTRIES: CountryConfig[] = [
  // ================= NORTH AMERICA =================
  {
    code: 'USA',
    name: 'United States',
    flag: '🇺🇸',
    continent: 'north_america',
    defaultState: 'Texas',
    states: [
      { name: 'Texas', defaultCity: 'Austin', cities: ['Austin', 'Dallas', 'Houston', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano'] },
      { name: 'California', defaultCity: 'Los Angeles', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Oakland', 'Irvine'] },
      { name: 'Florida', defaultCity: 'Miami', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Tallahassee', 'Sarasota'] },
      { name: 'New York', defaultCity: 'New York City', cities: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Yonkers'] },
      { name: 'Illinois', defaultCity: 'Chicago', cities: ['Chicago', 'Naperville', 'Rockford', 'Aurora', 'Joliet', 'Peoria'] },
      { name: 'Pennsylvania', defaultCity: 'Philadelphia', cities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'] },
      { name: 'Ohio', defaultCity: 'Columbus', cities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'] },
      { name: 'Georgia', defaultCity: 'Atlanta', cities: ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon'] },
      { name: 'North Carolina', defaultCity: 'Charlotte', cities: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'] },
      { name: 'Michigan', defaultCity: 'Detroit', cities: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Sterling Heights'] },
      { name: 'Washington', defaultCity: 'Seattle', cities: ['Seattle', 'Bellevue', 'Spokane', 'Tacoma', 'Vancouver', 'Redmond'] },
      { name: 'Arizona', defaultCity: 'Phoenix', cities: ['Phoenix', 'Scottsdale', 'Tucson', 'Mesa', 'Chandler', 'Gilbert'] },
      { name: 'Colorado', defaultCity: 'Denver', cities: ['Denver', 'Colorado Springs', 'Boulder', 'Aurora', 'Fort Collins'] },
      { name: 'Tennessee', defaultCity: 'Nashville', cities: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville'] },
      { name: 'Nevada', defaultCity: 'Las Vegas', cities: ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas'] },
      { name: 'Virginia', defaultCity: 'Virginia Beach', cities: ['Virginia Beach', 'Richmond', 'Norfolk', 'Alexandria', 'Arlington'] },
      { name: 'Massachusetts', defaultCity: 'Boston', cities: ['Boston', 'Worcester', 'Cambridge', 'Springfield', 'Lowell'] },
      { name: 'New Jersey', defaultCity: 'Newark', cities: ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Princeton'] },
    ],
  },
  {
    code: 'Canada',
    name: 'Canada',
    flag: '🇨🇦',
    continent: 'north_america',
    defaultState: 'Ontario',
    states: [
      { name: 'Ontario', defaultCity: 'Toronto', cities: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham'] },
      { name: 'British Columbia', defaultCity: 'Vancouver', cities: ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Richmond', 'Kelowna'] },
      { name: 'Alberta', defaultCity: 'Calgary', cities: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge'] },
      { name: 'Quebec', defaultCity: 'Montreal', cities: ['Montreal', 'Quebec City', 'Laval', 'Gatineau'] },
      { name: 'Saskatchewan', defaultCity: 'Saskatoon', cities: ['Saskatoon', 'Regina'] },
      { name: 'Manitoba', defaultCity: 'Winnipeg', cities: ['Winnipeg', 'Brandon'] },
      { name: 'Nova Scotia', defaultCity: 'Halifax', cities: ['Halifax', 'Dartmouth', 'Sydney'] },
      { name: 'New Brunswick', defaultCity: 'Moncton', cities: ['Moncton', 'Saint John', 'Fredericton'] },
    ],
  },
  {
    code: 'Mexico',
    name: 'Mexico',
    flag: '🇲🇽',
    continent: 'north_america',
    defaultState: 'Mexico City',
    states: [
      { name: 'Mexico City', defaultCity: 'Mexico City', cities: ['Mexico City', 'Polanco', 'Coyoacán', 'Benito Juárez'] },
      { name: 'Jalisco', defaultCity: 'Guadalajara', cities: ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Puerto Vallarta'] },
      { name: 'Nuevo León', defaultCity: 'Monterrey', cities: ['Monterrey', 'San Pedro Garza García', 'San Nicolás'] },
      { name: 'Puebla', defaultCity: 'Puebla', cities: ['Puebla', 'Cholula', 'Tehuacán'] },
      { name: 'Quintana Roo', defaultCity: 'Cancún', cities: ['Cancún', 'Playa del Carmen', 'Tulum'] },
      { name: 'Yucatán', defaultCity: 'Mérida', cities: ['Mérida', 'Valladolid', 'Progreso'] },
      { name: 'Baja California', defaultCity: 'Tijuana', cities: ['Tijuana', 'Mexicali', 'Ensenada'] },
    ],
  },
  {
    code: 'Costa Rica',
    name: 'Costa Rica',
    flag: '🇨🇷',
    continent: 'north_america',
    defaultState: 'San José',
    states: [
      { name: 'San José', defaultCity: 'San José', cities: ['San José', 'Escazú', 'Santa Ana', 'San Pedro'] },
      { name: 'Alajuela', defaultCity: 'Alajuela', cities: ['Alajuela', 'San Ramón'] },
      { name: 'Heredia', defaultCity: 'Heredia', cities: ['Heredia', 'Belén'] },
      { name: 'Guanacaste', defaultCity: 'Liberia', cities: ['Liberia', 'Tamarindo', 'Nicoya'] },
    ],
  },
  {
    code: 'Panama',
    name: 'Panama',
    flag: '🇵🇦',
    continent: 'north_america',
    defaultState: 'Panamá',
    states: [
      { name: 'Panamá', defaultCity: 'Panama City', cities: ['Panama City', 'San Miguelito', 'Costa del Este', 'Casco Viejo'] },
      { name: 'Colón', defaultCity: 'Colón', cities: ['Colón', 'Sabanitas'] },
      { name: 'Chiriquí', defaultCity: 'David', cities: ['David', 'Boquete'] },
    ],
  },
  {
    code: 'Dominican Republic',
    name: 'Dominican Republic',
    flag: '🇩🇴',
    continent: 'north_america',
    defaultState: 'Santo Domingo',
    states: [
      { name: 'Santo Domingo', defaultCity: 'Santo Domingo', cities: ['Santo Domingo', 'Santo Domingo Este', 'Bella Vista'] },
      { name: 'Santiago', defaultCity: 'Santiago de los Caballeros', cities: ['Santiago de los Caballeros'] },
      { name: 'La Altagracia', defaultCity: 'Punta Cana', cities: ['Punta Cana', 'Higüey', 'Bávaro'] },
    ],
  },
  {
    code: 'Puerto Rico',
    name: 'Puerto Rico',
    flag: '🇵🇷',
    continent: 'north_america',
    defaultState: 'San Juan',
    states: [
      { name: 'San Juan', defaultCity: 'San Juan', cities: ['San Juan', 'Santurce', 'Condado', 'Hato Rey'] },
      { name: 'Bayamón', defaultCity: 'Bayamón', cities: ['Bayamón'] },
      { name: 'Carolina', defaultCity: 'Carolina', cities: ['Carolina', 'Isla Verde'] },
      { name: 'Ponce', defaultCity: 'Ponce', cities: ['Ponce'] },
    ],
  },
  {
    code: 'Jamaica',
    name: 'Jamaica',
    flag: '🇯🇲',
    continent: 'north_america',
    defaultState: 'Kingston',
    states: [
      { name: 'Kingston', defaultCity: 'Kingston', cities: ['Kingston', 'New Kingston', 'Half Way Tree'] },
      { name: 'St. James', defaultCity: 'Montego Bay', cities: ['Montego Bay'] },
      { name: 'St. Catherine', defaultCity: 'Spanish Town', cities: ['Spanish Town', 'Portmore'] },
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
      { name: 'Greater London', defaultCity: 'London Central', cities: ['London Central', 'Westminster', 'Camden', 'Croydon', 'Greenwich', 'Kensington'] },
      { name: 'West Midlands', defaultCity: 'Birmingham', cities: ['Birmingham', 'Coventry', 'Wolverhampton', 'Solihull'] },
      { name: 'Greater Manchester', defaultCity: 'Manchester', cities: ['Manchester', 'Salford', 'Bolton', 'Stockport'] },
      { name: 'West Yorkshire', defaultCity: 'Leeds', cities: ['Leeds', 'Bradford', 'Wakefield', 'Huddersfield'] },
      { name: 'Scotland', defaultCity: 'Glasgow', cities: ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee'] },
      { name: 'Wales', defaultCity: 'Cardiff', cities: ['Cardiff', 'Swansea', 'Newport'] },
      { name: 'Merseyside', defaultCity: 'Liverpool', cities: ['Liverpool', 'Birkenhead', 'St Helens'] },
      { name: 'South Yorkshire', defaultCity: 'Sheffield', cities: ['Sheffield', 'Doncaster', 'Rotherham'] },
      { name: 'Hampshire', defaultCity: 'Southampton', cities: ['Southampton', 'Portsmouth', 'Winchester'] },
      { name: 'Bristol', defaultCity: 'Bristol', cities: ['Bristol', 'Bath', 'Weston-super-Mare'] },
    ],
  },
  {
    code: 'Germany',
    name: 'Germany',
    flag: '🇩🇪',
    continent: 'europe',
    defaultState: 'Bavaria',
    states: [
      { name: 'Bavaria', defaultCity: 'Munich', cities: ['Munich', 'Nuremberg', 'Augsburg', 'Regensburg', 'Ingolstadt'] },
      { name: 'Berlin', defaultCity: 'Berlin Mitte', cities: ['Berlin Mitte', 'Charlottenburg', 'Kreuzberg', 'Pankow'] },
      { name: 'North Rhine-Westphalia', defaultCity: 'Cologne', cities: ['Cologne', 'Düsseldorf', 'Dortmund', 'Essen', 'Bonn'] },
      { name: 'Baden-Württemberg', defaultCity: 'Stuttgart', cities: ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg', 'Heidelberg'] },
      { name: 'Hesse', defaultCity: 'Frankfurt am Main', cities: ['Frankfurt am Main', 'Wiesbaden', 'Kassel', 'Darmstadt'] },
      { name: 'Hamburg', defaultCity: 'Hamburg', cities: ['Hamburg', 'Altona', 'Harburg'] },
      { name: 'Saxony', defaultCity: 'Leipzig', cities: ['Leipzig', 'Dresden', 'Chemnitz'] },
    ],
  },
  {
    code: 'France',
    name: 'France',
    flag: '🇫🇷',
    continent: 'europe',
    defaultState: 'Île-de-France',
    states: [
      { name: 'Île-de-France', defaultCity: 'Paris', cities: ['Paris', 'Boulogne-Billancourt', 'Saint-Denis', 'Versailles', 'Nanterre'] },
      { name: 'Auvergne-Rhône-Alpes', defaultCity: 'Lyon', cities: ['Lyon', 'Grenoble', 'Saint-Étienne', 'Annecy'] },
      { name: 'Provence-Alpes-Côte d\'Azur', defaultCity: 'Marseille', cities: ['Marseille', 'Nice', 'Cannes', 'Toulon', 'Aix-en-Provence'] },
      { name: 'Occitanie', defaultCity: 'Toulouse', cities: ['Toulouse', 'Montpellier', 'Nîmes', 'Perpignan'] },
      { name: 'Nouvelle-Aquitaine', defaultCity: 'Bordeaux', cities: ['Bordeaux', 'Limoges', 'Poitiers', 'Pau'] },
      { name: 'Grand Est', defaultCity: 'Strasbourg', cities: ['Strasbourg', 'Reims', 'Metz', 'Nancy'] },
    ],
  },
  {
    code: 'Italy',
    name: 'Italy',
    flag: '🇮🇹',
    continent: 'europe',
    defaultState: 'Lombardy',
    states: [
      { name: 'Lombardy', defaultCity: 'Milan', cities: ['Milan', 'Brescia', 'Monza', 'Bergamo', 'Como'] },
      { name: 'Lazio', defaultCity: 'Rome', cities: ['Rome', 'Latina', 'Fiumicino', 'Viterbo'] },
      { name: 'Campania', defaultCity: 'Naples', cities: ['Naples', 'Salerno', 'Giugliano', 'Caserta'] },
      { name: 'Veneto', defaultCity: 'Venice', cities: ['Venice', 'Verona', 'Padua', 'Vicenza', 'Treviso'] },
      { name: 'Emilia-Romagna', defaultCity: 'Bologna', cities: ['Bologna', 'Parma', 'Modena', 'Reggio Emilia', 'Rimini'] },
      { name: 'Tuscany', defaultCity: 'Florence', cities: ['Florence', 'Prato', 'Livorno', 'Pisa', 'Siena'] },
      { name: 'Piedmont', defaultCity: 'Turin', cities: ['Turin', 'Novara', 'Alessandria'] },
    ],
  },
  {
    code: 'Spain',
    name: 'Spain',
    flag: '🇪🇸',
    continent: 'europe',
    defaultState: 'Madrid',
    states: [
      { name: 'Madrid', defaultCity: 'Madrid', cities: ['Madrid', 'Móstoles', 'Alcalá de Henares', 'Leganés', 'Getafe'] },
      { name: 'Catalonia', defaultCity: 'Barcelona', cities: ['Barcelona', 'L\'Hospitalet', 'Badalona', 'Terrassa', 'Sabadell'] },
      { name: 'Andalusia', defaultCity: 'Seville', cities: ['Seville', 'Málaga', 'Córdoba', 'Granada', 'Marbella'] },
      { name: 'Valencia', defaultCity: 'Valencia', cities: ['Valencia', 'Alicante', 'Elche', 'Castellón'] },
      { name: 'Basque Country', defaultCity: 'Bilbao', cities: ['Bilbao', 'Vitoria-Gasteiz', 'San Sebastián'] },
      { name: 'Balearic Islands', defaultCity: 'Palma de Mallorca', cities: ['Palma de Mallorca', 'Ibiza', 'Manacor'] },
    ],
  },
  {
    code: 'Netherlands',
    name: 'Netherlands',
    flag: '🇳🇱',
    continent: 'europe',
    defaultState: 'North Holland',
    states: [
      { name: 'North Holland', defaultCity: 'Amsterdam', cities: ['Amsterdam', 'Haarlem', 'Hilversum', 'Alkmaar'] },
      { name: 'South Holland', defaultCity: 'Rotterdam', cities: ['Rotterdam', 'The Hague', 'Leiden', 'Delft'] },
      { name: 'Utrecht', defaultCity: 'Utrecht', cities: ['Utrecht', 'Amersfoort', 'Veenendaal'] },
      { name: 'North Brabant', defaultCity: 'Eindhoven', cities: ['Eindhoven', 'Tilburg', 'Breda', 'Den Bosch'] },
      { name: 'Gelderland', defaultCity: 'Arnhem', cities: ['Arnhem', 'Nijmegen', 'Apeldoorn'] },
    ],
  },
  {
    code: 'Ireland',
    name: 'Ireland',
    flag: '🇮🇪',
    continent: 'europe',
    defaultState: 'Leinster',
    states: [
      { name: 'Leinster', defaultCity: 'Dublin', cities: ['Dublin', 'Dún Laoghaire', 'Swords', 'Dundalk', 'Bray'] },
      { name: 'Munster', defaultCity: 'Cork', cities: ['Cork', 'Limerick', 'Waterford', 'Tralee'] },
      { name: 'Connacht', defaultCity: 'Galway', cities: ['Galway', 'Sligo', 'Castlebar'] },
    ],
  },
  {
    code: 'Switzerland',
    name: 'Switzerland',
    flag: '🇨🇭',
    continent: 'europe',
    defaultState: 'Zurich',
    states: [
      { name: 'Zurich', defaultCity: 'Zurich', cities: ['Zurich', 'Winterthur', 'Uster'] },
      { name: 'Geneva', defaultCity: 'Geneva', cities: ['Geneva', 'Vernier', 'Lancy'] },
      { name: 'Vaud', defaultCity: 'Lausanne', cities: ['Lausanne', 'Yverdon-les-Bains', 'Montreux'] },
      { name: 'Bern', defaultCity: 'Bern', cities: ['Bern', 'Biel/Bienne', 'Thun'] },
      { name: 'Basel-Stadt', defaultCity: 'Basel', cities: ['Basel', 'Riehen'] },
    ],
  },
  {
    code: 'Sweden',
    name: 'Sweden',
    flag: '🇸🇪',
    continent: 'europe',
    defaultState: 'Stockholm',
    states: [
      { name: 'Stockholm', defaultCity: 'Stockholm', cities: ['Stockholm', 'Södertälje', 'Täby'] },
      { name: 'Västra Götaland', defaultCity: 'Gothenburg', cities: ['Gothenburg', 'Borås', 'Mölndal'] },
      { name: 'Skåne', defaultCity: 'Malmö', cities: ['Malmö', 'Helsingborg', 'Lund'] },
    ],
  },
  {
    code: 'Belgium',
    name: 'Belgium',
    flag: '🇧🇪',
    continent: 'europe',
    defaultState: 'Brussels',
    states: [
      { name: 'Brussels', defaultCity: 'Brussels', cities: ['Brussels', 'Schaerbeek', 'Anderlecht'] },
      { name: 'Flanders', defaultCity: 'Antwerp', cities: ['Antwerp', 'Ghent', 'Bruges', 'Leuven'] },
      { name: 'Wallonia', defaultCity: 'Charleroi', cities: ['Charleroi', 'Liège', 'Namur', 'Mons'] },
    ],
  },
  {
    code: 'Austria',
    name: 'Austria',
    flag: '🇦🇹',
    continent: 'europe',
    defaultState: 'Vienna',
    states: [
      { name: 'Vienna', defaultCity: 'Vienna', cities: ['Vienna'] },
      { name: 'Upper Austria', defaultCity: 'Linz', cities: ['Linz', 'Wels', 'Steyr'] },
      { name: 'Styria', defaultCity: 'Graz', cities: ['Graz', 'Leoben'] },
      { name: 'Salzburg', defaultCity: 'Salzburg', cities: ['Salzburg', 'Hallein'] },
    ],
  },
  {
    code: 'Norway',
    name: 'Norway',
    flag: '🇳🇴',
    continent: 'europe',
    defaultState: 'Oslo',
    states: [
      { name: 'Oslo', defaultCity: 'Oslo', cities: ['Oslo'] },
      { name: 'Viken', defaultCity: 'Bærum', cities: ['Bærum', 'Drammen', 'Asker'] },
      { name: 'Vestland', defaultCity: 'Bergen', cities: ['Bergen', 'Øygarden'] },
      { name: 'Trøndelag', defaultCity: 'Trondheim', cities: ['Trondheim'] },
    ],
  },
  {
    code: 'Denmark',
    name: 'Denmark',
    flag: '🇩🇰',
    continent: 'europe',
    defaultState: 'Capital Region',
    states: [
      { name: 'Capital Region', defaultCity: 'Copenhagen', cities: ['Copenhagen', 'Frederiksberg', 'Gentofte'] },
      { name: 'Central Denmark', defaultCity: 'Aarhus', cities: ['Aarhus', 'Randers', 'Horsens'] },
      { name: 'Southern Denmark', defaultCity: 'Odense', cities: ['Odense', 'Esbjerg', 'Kolding'] },
    ],
  },
  {
    code: 'Portugal',
    name: 'Portugal',
    flag: '🇵🇹',
    continent: 'europe',
    defaultState: 'Lisbon',
    states: [
      { name: 'Lisbon', defaultCity: 'Lisbon', cities: ['Lisbon', 'Sintra', 'Cascais', 'Amadora'] },
      { name: 'Porto', defaultCity: 'Porto', cities: ['Porto', 'Vila Nova de Gaia', 'Matosinhos'] },
      { name: 'Braga', defaultCity: 'Braga', cities: ['Braga', 'Guimarães'] },
      { name: 'Faro / Algarve', defaultCity: 'Faro', cities: ['Faro', 'Portimão', 'Albufeira'] },
    ],
  },
  {
    code: 'Poland',
    name: 'Poland',
    flag: '🇵🇱',
    continent: 'europe',
    defaultState: 'Masovian',
    states: [
      { name: 'Masovian', defaultCity: 'Warsaw', cities: ['Warsaw', 'Radom', 'Płock'] },
      { name: 'Lesser Poland', defaultCity: 'Kraków', cities: ['Kraków', 'Tarnów', 'Nowy Sącz'] },
      { name: 'Lower Silesia', defaultCity: 'Wrocław', cities: ['Wrocław', 'Wałbrzych', 'Legnica'] },
      { name: 'Silesian', defaultCity: 'Katowice', cities: ['Katowice', 'Częstochowa', 'Sosnowiec'] },
    ],
  },
  {
    code: 'Greece',
    name: 'Greece',
    flag: '🇬🇷',
    continent: 'europe',
    defaultState: 'Attica',
    states: [
      { name: 'Attica', defaultCity: 'Athens', cities: ['Athens', 'Piraeus', 'Peristeri', 'Kallithea'] },
      { name: 'Central Macedonia', defaultCity: 'Thessaloniki', cities: ['Thessaloniki', 'Kalamaria'] },
      { name: 'Crete', defaultCity: 'Heraklion', cities: ['Heraklion', 'Chania'] },
    ],
  },
  {
    code: 'Czech Republic',
    name: 'Czech Republic',
    flag: '🇨🇿',
    continent: 'europe',
    defaultState: 'Prague',
    states: [
      { name: 'Prague', defaultCity: 'Prague', cities: ['Prague'] },
      { name: 'South Moravian', defaultCity: 'Brno', cities: ['Brno', 'Znojmo'] },
      { name: 'Moravian-Silesian', defaultCity: 'Ostrava', cities: ['Ostrava', 'Havířov'] },
    ],
  },
  {
    code: 'Romania',
    name: 'Romania',
    flag: '🇷🇴',
    continent: 'europe',
    defaultState: 'Bucharest',
    states: [
      { name: 'Bucharest', defaultCity: 'Bucharest', cities: ['Bucharest'] },
      { name: 'Cluj', defaultCity: 'Cluj-Napoca', cities: ['Cluj-Napoca', 'Turda'] },
      { name: 'Timiș', defaultCity: 'Timișoara', cities: ['Timișoara', 'Lugoj'] },
      { name: 'Iași', defaultCity: 'Iași', cities: ['Iași', 'Pașcani'] },
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
      { name: 'Maharashtra', defaultCity: 'Mumbai', cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Navi Mumbai'] },
      { name: 'Karnataka', defaultCity: 'Bengaluru', cities: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi'] },
      { name: 'Delhi NCR', defaultCity: 'New Delhi', cities: ['New Delhi', 'Gurgaon', 'Noida', 'Faridabad', 'Ghaziabad'] },
      { name: 'Tamil Nadu', defaultCity: 'Chennai', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'] },
      { name: 'Telangana', defaultCity: 'Hyderabad', cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'] },
      { name: 'Gujarat', defaultCity: 'Ahmedabad', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'] },
      { name: 'Uttar Pradesh', defaultCity: 'Lucknow', cities: ['Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Prayagraj'] },
      { name: 'West Bengal', defaultCity: 'Kolkata', cities: ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol'] },
      { name: 'Kerala', defaultCity: 'Kochi', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur'] },
      { name: 'Rajasthan', defaultCity: 'Jaipur', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner'] },
      { name: 'Punjab', defaultCity: 'Ludhiana', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali'] },
      { name: 'Haryana', defaultCity: 'Gurugram', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal'] },
      { name: 'Madhya Pradesh', defaultCity: 'Indore', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior'] },
      { name: 'Bihar', defaultCity: 'Patna', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'] },
      { name: 'Odisha', defaultCity: 'Bhubaneswar', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'] },
    ],
  },
  {
    code: 'Singapore',
    name: 'Singapore',
    flag: '🇸🇬',
    continent: 'asia',
    defaultState: 'Central',
    states: [
      { name: 'Central', defaultCity: 'Singapore Downtown', cities: ['Singapore Downtown', 'Orchard', 'Marina Bay', 'Novena', 'Tanjong Pagar'] },
      { name: 'East', defaultCity: 'Tampines', cities: ['Tampines', 'Bedok', 'Pasir Ris', 'Changi'] },
      { name: 'West', defaultCity: 'Jurong East', cities: ['Jurong East', 'Clementi', 'Bukit Batok', 'Pioneer'] },
      { name: 'North', defaultCity: 'Woodlands', cities: ['Woodlands', 'Yishun', 'Sembawang'] },
      { name: 'North-East', defaultCity: 'Punggol', cities: ['Punggol', 'Sengkang', 'Hougang', 'Serangoon'] },
    ],
  },
  {
    code: 'Japan',
    name: 'Japan',
    flag: '🇯🇵',
    continent: 'asia',
    defaultState: 'Tokyo',
    states: [
      { name: 'Tokyo', defaultCity: 'Shinjuku', cities: ['Shinjuku', 'Shibuya', 'Chiyoda', 'Minato', 'Chuo', 'Setagaya'] },
      { name: 'Osaka', defaultCity: 'Osaka City', cities: ['Osaka City', 'Sakai', 'Higashiosaka'] },
      { name: 'Kanagawa', defaultCity: 'Yokohama', cities: ['Yokohama', 'Kawasaki', 'Sagamihara'] },
      { name: 'Aichi', defaultCity: 'Nagoya', cities: ['Nagoya', 'Toyota', 'Okazaki'] },
      { name: 'Kyoto', defaultCity: 'Kyoto City', cities: ['Kyoto City', 'Uji'] },
      { name: 'Fukuoka', defaultCity: 'Fukuoka City', cities: ['Fukuoka City', 'Kitakyushu'] },
    ],
  },
  {
    code: 'Malaysia',
    name: 'Malaysia',
    flag: '🇲🇾',
    continent: 'asia',
    defaultState: 'Kuala Lumpur',
    states: [
      { name: 'Kuala Lumpur', defaultCity: 'Kuala Lumpur', cities: ['Kuala Lumpur', 'Bukit Bintang', 'Bangsar', 'Mont Kiara'] },
      { name: 'Selangor', defaultCity: 'Petaling Jaya', cities: ['Petaling Jaya', 'Shah Alam', 'Subang Jaya', 'Klang'] },
      { name: 'Penang', defaultCity: 'George Town', cities: ['George Town', 'Butterworth', 'Bayan Lepas'] },
      { name: 'Johor', defaultCity: 'Johor Bahru', cities: ['Johor Bahru', 'Iskandar Puteri', 'Batu Pahat'] },
      { name: 'Sabah', defaultCity: 'Kota Kinabalu', cities: ['Kota Kinabalu', 'Sandakan'] },
    ],
  },
  {
    code: 'Philippines',
    name: 'Philippines',
    flag: '🇵🇭',
    continent: 'asia',
    defaultState: 'Metro Manila',
    states: [
      { name: 'Metro Manila', defaultCity: 'Makati', cities: ['Makati', 'Taguig / BGC', 'Quezon City', 'Manila', 'Pasig'] },
      { name: 'Cebu', defaultCity: 'Cebu City', cities: ['Cebu City', 'Mandaue', 'Lapu-Lapu'] },
      { name: 'Davao', defaultCity: 'Davao City', cities: ['Davao City'] },
      { name: 'Cavite', defaultCity: 'Bacoor', cities: ['Bacoor', 'Dasmariñas', 'Imus'] },
    ],
  },
  {
    code: 'Indonesia',
    name: 'Indonesia',
    flag: '🇮🇩',
    continent: 'asia',
    defaultState: 'Jakarta',
    states: [
      { name: 'Jakarta', defaultCity: 'South Jakarta', cities: ['South Jakarta', 'Central Jakarta', 'West Jakarta', 'North Jakarta'] },
      { name: 'West Java', defaultCity: 'Bandung', cities: ['Bandung', 'Bekasi', 'Depok', 'Bogor'] },
      { name: 'East Java', defaultCity: 'Surabaya', cities: ['Surabaya', 'Malang'] },
      { name: 'Bali', defaultCity: 'Denpasar', cities: ['Denpasar', 'Badung / Kuta', 'Gianyar / Ubud', 'Seminyak'] },
    ],
  },
  {
    code: 'Thailand',
    name: 'Thailand',
    flag: '🇹🇭',
    continent: 'asia',
    defaultState: 'Bangkok',
    states: [
      { name: 'Bangkok', defaultCity: 'Bangkok', cities: ['Bangkok', 'Sukhumvit', 'Silom', 'Chatuchak', 'Thonglor'] },
      { name: 'Chiang Mai', defaultCity: 'Chiang Mai', cities: ['Chiang Mai', 'Mae Rim'] },
      { name: 'Phuket', defaultCity: 'Phuket Town', cities: ['Phuket Town', 'Patong', 'Thalang'] },
      { name: 'Chonburi', defaultCity: 'Pattaya', cities: ['Pattaya', 'Si Racha'] },
    ],
  },
  {
    code: 'Vietnam',
    name: 'Vietnam',
    flag: '🇻🇳',
    continent: 'asia',
    defaultState: 'Ho Chi Minh',
    states: [
      { name: 'Ho Chi Minh', defaultCity: 'District 1', cities: ['District 1', 'District 7', 'Thu Duc', 'Binh Thanh'] },
      { name: 'Hanoi', defaultCity: 'Ba Dinh', cities: ['Ba Dinh', 'Hoan Kiem', 'Cau Giay', 'Dong Da'] },
      { name: 'Da Nang', defaultCity: 'Hai Chau', cities: ['Hai Chau', 'Son Tra'] },
    ],
  },
  {
    code: 'South Korea',
    name: 'South Korea',
    flag: '🇰🇷',
    continent: 'asia',
    defaultState: 'Seoul',
    states: [
      { name: 'Seoul', defaultCity: 'Gangnam', cities: ['Gangnam', 'Jung-gu', 'Mapo', 'Seocho', 'Songpa'] },
      { name: 'Gyeonggi', defaultCity: 'Suwon', cities: ['Suwon', 'Seongnam / Bundang', 'Goyang'] },
      { name: 'Busan', defaultCity: 'Haeundae', cities: ['Haeundae', 'Busanjin', 'Sasang'] },
    ],
  },
  {
    code: 'Taiwan',
    name: 'Taiwan',
    flag: '🇹🇼',
    continent: 'asia',
    defaultState: 'Taipei',
    states: [
      { name: 'Taipei', defaultCity: 'Xinyi', cities: ['Xinyi', 'Daan', 'Zhongshan', 'Neihu'] },
      { name: 'New Taipei', defaultCity: 'Banqiao', cities: ['Banqiao', 'Xinzhuang', 'Zhonghe'] },
      { name: 'Kaohsiung', defaultCity: 'Lingya', cities: ['Lingya', 'Sanmin', 'Qianzhen'] },
    ],
  },
  {
    code: 'Hong Kong',
    name: 'Hong Kong',
    flag: '🇭🇰',
    continent: 'asia',
    defaultState: 'Central & Western',
    states: [
      { name: 'Central & Western', defaultCity: 'Central', cities: ['Central', 'Sheung Wan', 'Admiralty'] },
      { name: 'Wan Chai', defaultCity: 'Wan Chai', cities: ['Wan Chai', 'Causeway Bay'] },
      { name: 'Yau Tsim Mong', defaultCity: 'Tsim Sha Tsui', cities: ['Tsim Sha Tsui', 'Mong Kok'] },
    ],
  },
  {
    code: 'Pakistan',
    name: 'Pakistan',
    flag: '🇵🇰',
    continent: 'asia',
    defaultState: 'Punjab',
    states: [
      { name: 'Punjab', defaultCity: 'Lahore', cities: ['Lahore', 'Faisalabad', 'Rawalpindi', 'Multan', 'Gujranwala'] },
      { name: 'Sindh', defaultCity: 'Karachi', cities: ['Karachi', 'Hyderabad', 'Sukkur'] },
      { name: 'Islamabad Capital', defaultCity: 'Islamabad', cities: ['Islamabad'] },
    ],
  },
  {
    code: 'Bangladesh',
    name: 'Bangladesh',
    flag: '🇧🇩',
    continent: 'asia',
    defaultState: 'Dhaka',
    states: [
      { name: 'Dhaka', defaultCity: 'Dhaka', cities: ['Dhaka', 'Gulshan', 'Uttara', 'Dhanmondi', 'Mirpur'] },
      { name: 'Chittagong', defaultCity: 'Chittagong', cities: ['Chittagong', 'Agrabad'] },
      { name: 'Sylhet', defaultCity: 'Sylhet', cities: ['Sylhet'] },
    ],
  },
  {
    code: 'Sri Lanka',
    name: 'Sri Lanka',
    flag: '🇱🇰',
    continent: 'asia',
    defaultState: 'Western',
    states: [
      { name: 'Western', defaultCity: 'Colombo', cities: ['Colombo', 'Dehiwala', 'Moratuwa', 'Negombo'] },
      { name: 'Central', defaultCity: 'Kandy', cities: ['Kandy'] },
      { name: 'Southern', defaultCity: 'Galle', cities: ['Galle'] },
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
      { name: 'Dubai', defaultCity: 'Downtown Dubai', cities: ['Downtown Dubai', 'Business Bay', 'Dubai Marina', 'Deira', 'Jumeirah', 'Al Barsha', 'JLT'] },
      { name: 'Abu Dhabi', defaultCity: 'Abu Dhabi City', cities: ['Abu Dhabi City', 'Al Reem Island', 'Al Ain', 'Yas Island'] },
      { name: 'Sharjah', defaultCity: 'Sharjah City', cities: ['Sharjah City', 'Al Nahda', 'Al Majaz'] },
      { name: 'Ajman', defaultCity: 'Ajman City', cities: ['Ajman City'] },
      { name: 'Ras Al Khaimah', defaultCity: 'RAK City', cities: ['RAK City', 'Al Marjan Island'] },
    ],
  },
  {
    code: 'Saudi Arabia',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    continent: 'middle_east',
    defaultState: 'Riyadh',
    states: [
      { name: 'Riyadh', defaultCity: 'Riyadh', cities: ['Riyadh', 'Olaya', 'Al Malaz', 'Al Nakheel', 'Al Sulaimaniyah'] },
      { name: 'Makkah', defaultCity: 'Jeddah', cities: ['Jeddah', 'Mecca', 'Taif'] },
      { name: 'Eastern Province', defaultCity: 'Dammam', cities: ['Dammam', 'Khobar', 'Jubail'] },
      { name: 'Medina', defaultCity: 'Medina', cities: ['Medina', 'Yanbu'] },
    ],
  },
  {
    code: 'Qatar',
    name: 'Qatar',
    flag: '🇶🇦',
    continent: 'middle_east',
    defaultState: 'Doha',
    states: [
      { name: 'Doha', defaultCity: 'Doha', cities: ['Doha', 'West Bay', 'The Pearl', 'Lusail', 'Al Sadd'] },
      { name: 'Al Rayyan', defaultCity: 'Al Rayyan', cities: ['Al Rayyan', 'Education City'] },
      { name: 'Al Wakrah', defaultCity: 'Al Wakrah', cities: ['Al Wakrah'] },
    ],
  },
  {
    code: 'Kuwait',
    name: 'Kuwait',
    flag: '🇰🇼',
    continent: 'middle_east',
    defaultState: 'Al Asimah',
    states: [
      { name: 'Al Asimah', defaultCity: 'Kuwait City', cities: ['Kuwait City', 'Sharq', 'Dasman', 'Mirqab'] },
      { name: 'Hawalli', defaultCity: 'Hawalli', cities: ['Hawalli', 'Salmiya', 'Jabriya'] },
      { name: 'Farwaniya', defaultCity: 'Farwaniya', cities: ['Farwaniya', 'Al Rai'] },
    ],
  },
  {
    code: 'Bahrain',
    name: 'Bahrain',
    flag: '🇧🇭',
    continent: 'middle_east',
    defaultState: 'Capital',
    states: [
      { name: 'Capital', defaultCity: 'Manama', cities: ['Manama', 'Juffair', 'Seef', 'Diplomatic Area'] },
      { name: 'Muharraq', defaultCity: 'Muharraq', cities: ['Muharraq', 'Amwaj Islands'] },
    ],
  },
  {
    code: 'Oman',
    name: 'Oman',
    flag: '🇴🇲',
    continent: 'middle_east',
    defaultState: 'Muscat',
    states: [
      { name: 'Muscat', defaultCity: 'Muscat', cities: ['Muscat', 'Ruwi', 'Al Khuwair', 'Seeb', 'Muttrah'] },
      { name: 'Dhofar', defaultCity: 'Salalah', cities: ['Salalah'] },
    ],
  },
  {
    code: 'Israel',
    name: 'Israel',
    flag: '🇮🇱',
    continent: 'middle_east',
    defaultState: 'Tel Aviv',
    states: [
      { name: 'Tel Aviv', defaultCity: 'Tel Aviv-Yafo', cities: ['Tel Aviv-Yafo', 'Ramat Gan', 'Herzliya', 'Holon', 'Bat Yam'] },
      { name: 'Jerusalem', defaultCity: 'Jerusalem', cities: ['Jerusalem', 'Beit Shemesh'] },
      { name: 'Central District', defaultCity: 'Rishon LeZion', cities: ['Rishon LeZion', 'Petah Tikva', 'Netanya', 'Rehovot'] },
      { name: 'Haifa', defaultCity: 'Haifa', cities: ['Haifa', 'Hadera'] },
    ],
  },
  {
    code: 'Turkey',
    name: 'Turkey',
    flag: '🇹🇷',
    continent: 'middle_east',
    defaultState: 'Istanbul',
    states: [
      { name: 'Istanbul', defaultCity: 'Kadıköy', cities: ['Kadıköy', 'Beşiktaş', 'Şişli', 'Beyoğlu', 'Bakırköy', 'Üsküdar'] },
      { name: 'Ankara', defaultCity: 'Çankaya', cities: ['Çankaya', 'Yenimahalle', 'Keçiören'] },
      { name: 'Izmir', defaultCity: 'Konak', cities: ['Konak', 'Karşıyaka', 'Bornova'] },
      { name: 'Antalya', defaultCity: 'Muratpaşa', cities: ['Muratpaşa', 'Kepez', 'Alanya'] },
    ],
  },
  {
    code: 'Jordan',
    name: 'Jordan',
    flag: '🇯🇴',
    continent: 'middle_east',
    defaultState: 'Amman',
    states: [
      { name: 'Amman', defaultCity: 'Amman', cities: ['Amman', 'Abdoun', 'Sweifieh', 'Shmeisani', 'Jabal Amman'] },
      { name: 'Zarqa', defaultCity: 'Zarqa', cities: ['Zarqa'] },
      { name: 'Irbid', defaultCity: 'Irbid', cities: ['Irbid'] },
    ],
  },

  // ================= OCEANIA / AUSTRALIA =================
  {
    code: 'Australia',
    name: 'Australia',
    flag: '🇦🇺',
    continent: 'oceania',
    defaultState: 'New South Wales',
    states: [
      { name: 'New South Wales', defaultCity: 'Sydney', cities: ['Sydney', 'Newcastle', 'Wollongong', 'Parramatta', 'Central Coast'] },
      { name: 'Victoria', defaultCity: 'Melbourne', cities: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Frankston'] },
      { name: 'Queensland', defaultCity: 'Brisbane', cities: ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'] },
      { name: 'Western Australia', defaultCity: 'Perth', cities: ['Perth', 'Fremantle', 'Mandurah', 'Bunbury'] },
      { name: 'South Australia', defaultCity: 'Adelaide', cities: ['Adelaide', 'Mount Gambier'] },
      { name: 'Australian Capital Territory', defaultCity: 'Canberra', cities: ['Canberra'] },
      { name: 'Tasmania', defaultCity: 'Hobart', cities: ['Hobart', 'Launceston'] },
    ],
  },
  {
    code: 'New Zealand',
    name: 'New Zealand',
    flag: '🇳🇿',
    continent: 'oceania',
    defaultState: 'Auckland',
    states: [
      { name: 'Auckland', defaultCity: 'Auckland Central', cities: ['Auckland Central', 'North Shore', 'Manukau', 'Waitakere'] },
      { name: 'Wellington', defaultCity: 'Wellington Central', cities: ['Wellington Central', 'Lower Hutt', 'Porirua'] },
      { name: 'Canterbury', defaultCity: 'Christchurch', cities: ['Christchurch', 'Timaru', 'Ashburton'] },
      { name: 'Waikato', defaultCity: 'Hamilton', cities: ['Hamilton', 'Taupo', 'Cambridge'] },
      { name: 'Bay of Plenty', defaultCity: 'Tauranga', cities: ['Tauranga', 'Rotorua'] },
      { name: 'Otago', defaultCity: 'Dunedin', cities: ['Dunedin', 'Queenstown'] },
    ],
  },
  {
    code: 'Fiji',
    name: 'Fiji',
    flag: '🇫🇯',
    continent: 'oceania',
    defaultState: 'Central',
    states: [
      { name: 'Central', defaultCity: 'Suva', cities: ['Suva', 'Nausori'] },
      { name: 'Western', defaultCity: 'Nadi', cities: ['Nadi', 'Lautoka'] },
    ],
  },

  // ================= SOUTH AMERICA =================
  {
    code: 'Brazil',
    name: 'Brazil',
    flag: '🇧🇷',
    continent: 'south_america',
    defaultState: 'São Paulo',
    states: [
      { name: 'São Paulo', defaultCity: 'São Paulo', cities: ['São Paulo', 'Campinas', 'Guarulhos', 'São Bernardo', 'Santo André'] },
      { name: 'Rio de Janeiro', defaultCity: 'Rio de Janeiro', cities: ['Rio de Janeiro', 'Niterói', 'Nova Iguaçu', 'Duque de Caxias'] },
      { name: 'Minas Gerais', defaultCity: 'Belo Horizonte', cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'] },
      { name: 'Paraná', defaultCity: 'Curitiba', cities: ['Curitiba', 'Londrina', 'Maringá'] },
      { name: 'Rio Grande do Sul', defaultCity: 'Porto Alegre', cities: ['Porto Alegre', 'Caxias do Sul'] },
      { name: 'Bahia', defaultCity: 'Salvador', cities: ['Salvador', 'Feira de Santana'] },
      { name: 'Santa Catarina', defaultCity: 'Florianópolis', cities: ['Florianópolis', 'Joinville', 'Blumenau'] },
    ],
  },
  {
    code: 'Argentina',
    name: 'Argentina',
    flag: '🇦🇷',
    continent: 'south_america',
    defaultState: 'Buenos Aires',
    states: [
      { name: 'Buenos Aires', defaultCity: 'Buenos Aires', cities: ['Buenos Aires', 'Palermo', 'Recoleta', 'La Plata', 'Mar del Plata'] },
      { name: 'Córdoba', defaultCity: 'Córdoba', cities: ['Córdoba', 'Villa Carlos Paz'] },
      { name: 'Santa Fe', defaultCity: 'Rosario', cities: ['Rosario', 'Santa Fe'] },
      { name: 'Mendoza', defaultCity: 'Mendoza', cities: ['Mendoza', 'Godoy Cruz'] },
    ],
  },
  {
    code: 'Colombia',
    name: 'Colombia',
    flag: '🇨🇴',
    continent: 'south_america',
    defaultState: 'Bogotá D.C.',
    states: [
      { name: 'Bogotá D.C.', defaultCity: 'Bogotá', cities: ['Bogotá', 'Chapinero', 'Usaquén', 'Suba'] },
      { name: 'Antioquia', defaultCity: 'Medellín', cities: ['Medellín', 'Envigado', 'Bello', 'Itagüí'] },
      { name: 'Valle del Cauca', defaultCity: 'Cali', cities: ['Cali', 'Palmira', 'Buenaventura'] },
      { name: 'Atlántico', defaultCity: 'Barranquilla', cities: ['Barranquilla', 'Soledad'] },
    ],
  },
  {
    code: 'Chile',
    name: 'Chile',
    flag: '🇨🇱',
    continent: 'south_america',
    defaultState: 'Santiago Metropolitan',
    states: [
      { name: 'Santiago Metropolitan', defaultCity: 'Santiago', cities: ['Santiago', 'Las Condes', 'Providencia', 'Vitacura'] },
      { name: 'Valparaíso', defaultCity: 'Valparaíso', cities: ['Valparaíso', 'Viña del Mar'] },
      { name: 'Biobío', defaultCity: 'Concepción', cities: ['Concepción', 'Talcahuano'] },
    ],
  },
  {
    code: 'Peru',
    name: 'Peru',
    flag: '🇵🇪',
    continent: 'south_america',
    defaultState: 'Lima',
    states: [
      { name: 'Lima', defaultCity: 'Lima', cities: ['Lima', 'Miraflores', 'San Isidro', 'Surco'] },
      { name: 'Arequipa', defaultCity: 'Arequipa', cities: ['Arequipa'] },
      { name: 'Cusco', defaultCity: 'Cusco', cities: ['Cusco'] },
    ],
  },
  {
    code: 'Ecuador',
    name: 'Ecuador',
    flag: '🇪🇨',
    continent: 'south_america',
    defaultState: 'Pichincha',
    states: [
      { name: 'Pichincha', defaultCity: 'Quito', cities: ['Quito'] },
      { name: 'Guayas', defaultCity: 'Guayaquil', cities: ['Guayaquil'] },
      { name: 'Azuay', defaultCity: 'Cuenca', cities: ['Cuenca'] },
    ],
  },
  {
    code: 'Uruguay',
    name: 'Uruguay',
    flag: '🇺🇾',
    continent: 'south_america',
    defaultState: 'Montevideo',
    states: [
      { name: 'Montevideo', defaultCity: 'Montevideo', cities: ['Montevideo', 'Pocitos', 'Carrasco'] },
      { name: 'Maldonado', defaultCity: 'Punta del Este', cities: ['Punta del Este', 'Maldonado'] },
    ],
  },

  // ================= AFRICA =================
  {
    code: 'South Africa',
    name: 'South Africa',
    flag: '🇿🇦',
    continent: 'africa',
    defaultState: 'Gauteng',
    states: [
      { name: 'Gauteng', defaultCity: 'Johannesburg', cities: ['Johannesburg', 'Pretoria', 'Sandton', 'Soweto', 'Centurion', 'Midrand'] },
      { name: 'Western Cape', defaultCity: 'Cape Town', cities: ['Cape Town', 'Stellenbosch', 'George', 'Paarl'] },
      { name: 'KwaZulu-Natal', defaultCity: 'Durban', cities: ['Durban', 'Pietermaritzburg', 'Umhlanga'] },
      { name: 'Eastern Cape', defaultCity: 'Gqeberha', cities: ['Gqeberha', 'East London'] },
    ],
  },
  {
    code: 'Nigeria',
    name: 'Nigeria',
    flag: '🇳🇬',
    continent: 'africa',
    defaultState: 'Lagos',
    states: [
      { name: 'Lagos', defaultCity: 'Lagos Island', cities: ['Lagos Island', 'Victoria Island', 'Ikeja', 'Lekki', 'Surulere'] },
      { name: 'Federal Capital Territory', defaultCity: 'Abuja', cities: ['Abuja', 'Garki', 'Wuse', 'Maitama'] },
      { name: 'Rivers', defaultCity: 'Port Harcourt', cities: ['Port Harcourt'] },
      { name: 'Kano', defaultCity: 'Kano', cities: ['Kano'] },
      { name: 'Oyo', defaultCity: 'Ibadan', cities: ['Ibadan'] },
    ],
  },
  {
    code: 'Kenya',
    name: 'Kenya',
    flag: '🇰🇪',
    continent: 'africa',
    defaultState: 'Nairobi',
    states: [
      { name: 'Nairobi', defaultCity: 'Nairobi', cities: ['Nairobi', 'Westlands', 'Kilimani', 'Karen'] },
      { name: 'Mombasa', defaultCity: 'Mombasa', cities: ['Mombasa', 'Nyali'] },
      { name: 'Kisumu', defaultCity: 'Kisumu', cities: ['Kisumu'] },
    ],
  },
  {
    code: 'Egypt',
    name: 'Egypt',
    flag: '🇪🇬',
    continent: 'africa',
    defaultState: 'Cairo',
    states: [
      { name: 'Cairo', defaultCity: 'Cairo', cities: ['Cairo', 'New Cairo', 'Maadi', 'Heliopolis', 'Zamalek'] },
      { name: 'Giza', defaultCity: 'Giza', cities: ['Giza', '6th of October', 'Sheikh Zayed'] },
      { name: 'Alexandria', defaultCity: 'Alexandria', cities: ['Alexandria', 'Smouha'] },
    ],
  },
  {
    code: 'Morocco',
    name: 'Morocco',
    flag: '🇲🇦',
    continent: 'africa',
    defaultState: 'Casablanca-Settat',
    states: [
      { name: 'Casablanca-Settat', defaultCity: 'Casablanca', cities: ['Casablanca', 'Mohammedia'] },
      { name: 'Marrakech-Safi', defaultCity: 'Marrakech', cities: ['Marrakech'] },
      { name: 'Rabat-Salé-Kénitra', defaultCity: 'Rabat', cities: ['Rabat', 'Salé', 'Kénitra'] },
      { name: 'Tangier-Tetouan', defaultCity: 'Tangier', cities: ['Tangier', 'Tetouan'] },
    ],
  },
  {
    code: 'Ghana',
    name: 'Ghana',
    flag: '🇬🇭',
    continent: 'africa',
    defaultState: 'Greater Accra',
    states: [
      { name: 'Greater Accra', defaultCity: 'Accra', cities: ['Accra', 'Tema', 'East Legon'] },
      { name: 'Ashanti', defaultCity: 'Kumasi', cities: ['Kumasi'] },
    ],
  },
  {
    code: 'Mauritius',
    name: 'Mauritius',
    flag: '🇲🇺',
    continent: 'africa',
    defaultState: 'Port Louis',
    states: [
      { name: 'Port Louis', defaultCity: 'Port Louis', cities: ['Port Louis'] },
      { name: 'Plaines Wilhems', defaultCity: 'Curepipe', cities: ['Curepipe', 'Beau Bassin-Rose Hill'] },
    ],
  },
];

const POPULAR_CATEGORIES = [
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

export function LeadScraperPage({ store, onNavigate }: Props) {
  // Search Form State
  const [category, setCategory] = useState('Dentist');
  const [continent, setContinent] = useState<string>('north_america');
  const [country, setCountry] = useState<string>('USA');
  const [state, setState] = useState<string>('Texas');
  const [city, setCity] = useState<string>('Austin');
  const [limit, setLimit] = useState<number>(10);

  // Custom / "Use My Own" mode
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customCountry, setCustomCountry] = useState<string>('');
  const [customState, setCustomState] = useState<string>('');

  // Scraping Execution State
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeStep, setScrapeStep] = useState<string>('');
  const [scrapedLeads, setScrapedLeads] = useState<ScrapedLead[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Filter & Import State
  const [filterType, setFilterType] = useState<'all' | 'with_email' | 'with_phone' | 'with_website'>('all');
  const [targetListId, setTargetListId] = useState<string>('none');
  const [batchName, setBatchName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<{
    importedCount: number;
    duplicateCount: number;
    batchName?: string;
  } | null>(null);

  // Available countries filtered by selected continent
  const availableCountries = useMemo(() => {
    if (continent === 'custom') return COUNTRIES;
    return COUNTRIES.filter((c) => c.continent === continent);
  }, [continent]);

  // Current Country Config
  const currentCountryConfig = useMemo(() => {
    return (
      COUNTRIES.find((c) => c.code.toLowerCase() === country.toLowerCase()) ||
      availableCountries[0] ||
      COUNTRIES[0]
    );
  }, [country, availableCountries]);

  // Current State Config
  const currentStateConfig = useMemo(() => {
    return (
      currentCountryConfig.states.find((s) => s.name.toLowerCase() === state.toLowerCase()) ||
      currentCountryConfig.states[0]
    );
  }, [currentCountryConfig, state]);

  // Effective target location strings (handling custom inputs)
  const effectiveCountry = useMemo(() => {
    if (isCustomMode) return customCountry.trim() || 'USA';
    if (country === 'custom') return customCountry.trim() || 'USA';
    return country;
  }, [isCustomMode, customCountry, country]);

  const effectiveState = useMemo(() => {
    if (isCustomMode) return customState.trim() || state;
    if (state === 'custom') return customState.trim() || 'Custom Region';
    return state;
  }, [isCustomMode, customState, state]);

  const effectiveCity = useMemo(() => {
    return city.trim();
  }, [city]);

  // When continent changes, adapt default country, state, and city
  const handleContinentChange = (newContinentId: string) => {
    setContinent(newContinentId);
    if (newContinentId === 'custom') {
      setIsCustomMode(true);
      return;
    }
    setIsCustomMode(false);
    const matchingCountries = COUNTRIES.filter((c) => c.continent === newContinentId);
    if (matchingCountries.length > 0) {
      const targetCountry = matchingCountries[0];
      setCountry(targetCountry.code);
      const defaultStateObj =
        targetCountry.states.find((s) => s.name === targetCountry.defaultState) || targetCountry.states[0];
      if (defaultStateObj) {
        setState(defaultStateObj.name);
        setCity(defaultStateObj.defaultCity || defaultStateObj.cities[0] || '');
      }
    }
  };

  // When country changes, adapt default state and default city
  const handleCountryChange = (newCountryCode: string) => {
    if (newCountryCode === 'custom') {
      setCountry('custom');
      return;
    }
    setCountry(newCountryCode);
    const foundCountry = COUNTRIES.find((c) => c.code === newCountryCode);
    if (foundCountry) {
      const defaultStateObj =
        foundCountry.states.find((s) => s.name === foundCountry.defaultState) || foundCountry.states[0];
      if (defaultStateObj) {
        setState(defaultStateObj.name);
        setCity(defaultStateObj.defaultCity || defaultStateObj.cities[0] || '');
      }
    }
  };

  // When state changes, adapt default city
  const handleStateChange = (newStateName: string) => {
    if (newStateName === 'custom') {
      setState('custom');
      return;
    }
    setState(newStateName);
    const foundState = currentCountryConfig.states.find(
      (s) => s.name.toLowerCase() === newStateName.toLowerCase()
    );
    if (foundState) {
      setCity(foundState.defaultCity || foundState.cities[0] || '');
    }
  };

  // Run GMB Scrape
  const handleStartScrape = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!category.trim()) {
      setError('Please provide a business category (e.g. Dentist, Plumber, Real Estate)');
      return;
    }
    if (!effectiveState.trim()) {
      setError('Please provide a State or Region');
      return;
    }
    if (!effectiveCountry.trim()) {
      setError('Please provide a Country');
      return;
    }

    setError(null);
    setIsScraping(true);
    setImportSuccess(null);
    setScrapeStep('Connecting to Google Business Profiles & Maps engine...');

    try {
      const stepTimer1 = setTimeout(() => {
        setScrapeStep(`Searching verified GMB listings for "${category}" in ${effectiveCity ? effectiveCity + ', ' : ''}${effectiveState}...`);
      }, 1200);

      const stepTimer2 = setTimeout(() => {
        setScrapeStep('Interpreting business ratings, phone numbers and official websites...');
      }, 3000);

      const stepTimer3 = setTimeout(() => {
        setScrapeStep('Crawling business homepages & contact pages to discover verified emails...');
      }, 5500);

      const res = await api.searchGmbLeads({
        category: category.trim(),
        continent: continent !== 'custom' ? continent : undefined,
        country: effectiveCountry,
        state: effectiveState,
        city: effectiveCity || undefined,
        limit,
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      if (res.success && res.leads) {
        setScrapedLeads(res.leads);
        // Default select all discovered leads
        const allIdx = new Set(res.leads.map((_, i) => i));
        setSelectedIndices(allIdx);

        // Pre-fill suggested batch name
        const loc = effectiveCity ? `${effectiveCity}, ${effectiveState}` : effectiveState;
        setBatchName(`GMB Scrape — ${category.trim()} in ${loc} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`);
      } else {
        setError('No listings found matching this criteria. Try broadening your location or category.');
      }
    } catch (err: any) {
      console.error('[LeadScraperPage] Scrape error:', err);
      setError(err.message || 'Failed to search Google Business Profiles');
    } finally {
      setIsScraping(false);
      setScrapeStep('');
    }
  };

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return scrapedLeads.filter((l) => {
      if (filterType === 'with_email') return Boolean(l.email && l.email.includes('@'));
      if (filterType === 'with_phone') return Boolean(l.phone && l.phone.trim());
      if (filterType === 'with_website') return Boolean(l.website && l.website.trim());
      return true;
    });
  }, [scrapedLeads, filterType]);

  // Lead Selection Handlers
  const toggleSelectLead = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIndices(next);
  };

  const handleSelectAll = () => {
    setSelectedIndices(new Set(scrapedLeads.map((_, i) => i)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  // Import Selected Leads into CRM Database
  const handleImportLeads = async () => {
    const toImport = scrapedLeads.filter((_, idx) => selectedIndices.has(idx));
    if (toImport.length === 0) {
      setError('Please select at least one lead to import.');
      return;
    }

    try {
      setIsImporting(true);
      setError(null);
      const res = await api.importScrapedLeads({
        leads: toImport,
        listId: targetListId === 'none' ? undefined : targetListId,
        batchName: batchName.trim() || undefined,
      });

      if (res.success) {
        setImportSuccess({
          importedCount: res.importedCount,
          duplicateCount: res.duplicateCount,
          batchName: res.batchName,
        });
        // Refresh store
        await store.refreshAll();
      } else {
        setError('Failed to import leads. Please try again.');
      }
    } catch (err: any) {
      console.error('[LeadScraperPage] Import error:', err);
      setError(err.message || 'Failed to import scraped leads');
    } finally {
      setIsImporting(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const toExport = scrapedLeads.filter((_, idx) => selectedIndices.has(idx));
    const leadsToExport = toExport.length > 0 ? toExport : scrapedLeads;
    if (leadsToExport.length === 0) return;

    const headers = ['Business Name', 'Category', 'Phone', 'Email', 'Website', 'Address', 'Rating', 'Reviews Count', 'Google Maps URL'];
    const rows = leadsToExport.map((l) => [
      `"${(l.businessName || '').replace(/"/g, '""')}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.website || '').replace(/"/g, '""')}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      l.rating || '',
      l.reviewsCount || 0,
      `"${(l.googleMapsUrl || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `gmb_leads_${category.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Edit lead's discovered email inline
  const handleUpdateLeadEmail = (index: number, newEmail: string) => {
    setScrapedLeads((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], email: newEmail.trim(), emailDiscovered: Boolean(newEmail.trim()) };
      }
      return copy;
    });
  };

  // Summary Metrics
  const stats = useMemo(() => {
    const total = scrapedLeads.length;
    const withEmail = scrapedLeads.filter((l) => l.email && l.email.includes('@')).length;
    const withPhone = scrapedLeads.filter((l) => l.phone && l.phone.trim()).length;
    const withWebsite = scrapedLeads.filter((l) => l.website && l.website.trim()).length;
    const avgRating =
      total > 0
        ? (scrapedLeads.reduce((acc, l) => acc + (l.rating || 0), 0) / total).toFixed(1)
        : '0.0';

    return { total, withEmail, withPhone, withWebsite, avgRating };
  }, [scrapedLeads]);

  // Target query display
  const targetQueryDisplay = useMemo(() => {
    const cat = category.trim() || '...';
    const loc = [effectiveCity, effectiveState, effectiveCountry].filter(Boolean).join(', ');
    const contName = CONTINENTS.find((c) => c.id === continent)?.name;
    return `"${cat}" in ${loc || '...'} ${contName && continent !== 'custom' ? `(${contName})` : ''} • ${limit} leads`;
  }, [category, effectiveCity, effectiveState, effectiveCountry, continent, limit]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Business Profile (GMB) Lead Scraper"
        subtitle="Search live Google Maps & Google Business Profiles, auto-crawl websites for contact emails & phone numbers, and import directly into your outreach campaigns."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => store.refreshAll()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <RefreshCw size={13} className="text-slate-500" />
              <span>Refresh CRM</span>
            </button>
            {onNavigate && (
              <button
                onClick={() => onNavigate('crm')}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-xs"
              >
                <span>View CRM Leads</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        }
      />

      {/* Main Search Configuration Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-xs">
              <Compass size={22} className="animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Search Google Maps by Category &amp; Location
              </h3>
              <p className="text-xs text-slate-500">
                Filter by Continent ➔ Country ➔ State/Region ➔ City, or enter custom regions worldwide. Live website crawling extracts verified emails.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
            <Sparkles size={12} className="text-amber-500" />
            Live Google Maps Engine
          </span>
        </div>

        <form onSubmit={handleStartScrape} className="space-y-4">
          {/* Row 1: Business Category & Lead Count */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Category / Keyword */}
            <div className="md:col-span-9">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Business Category / Keyword <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Dentist, Plumber, Real Estate, Roofer, Accounting Firm..."
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
              </div>
            </div>

            {/* Count / Limit (Up to 100) */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Leads To Extract
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm font-bold text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer"
              >
                <option value={10}>10 Leads</option>
                <option value={25}>25 Leads</option>
                <option value={50}>50 Leads</option>
                <option value={75}>75 Leads</option>
                <option value={100}>100 Leads (Max)</option>
              </select>
            </div>
          </div>

          {/* Popular Category Quick-Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Popular Niches:
            </span>
            {POPULAR_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  category.toLowerCase() === cat.toLowerCase()
                    ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Location Hierarchy Container */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Target Location Hierarchy
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  (Continent ➔ Country ➔ State/Region ➔ City)
                </span>
              </div>

              {/* Toggle: Presets vs Custom Mode */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg shadow-2xs">
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    !isCustomMode
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Globe size={12} />
                    <span>Presets</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    isCustomMode
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Type any custom Country, State, or City"
                >
                  <span className="flex items-center gap-1">
                    <Edit3 size={12} />
                    <span>Enter My Own</span>
                  </span>
                </button>
              </div>
            </div>

            {!isCustomMode ? (
              /* Presets Hierarchy Mode */
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* 1. Continent */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    1. Continent <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={continent}
                    onChange={(e) => handleContinentChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-2xs"
                  >
                    {CONTINENTS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Country (Filtered by Continent) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>2. Country <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-amber-700 font-semibold lowercase">
                      {availableCountries.length} countries
                    </span>
                  </label>
                  <select
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-2xs"
                  >
                    {availableCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.states.length} states)
                      </option>
                    ))}
                    <option value="custom">✏️ Enter Custom Country...</option>
                  </select>
                  {country === 'custom' && (
                    <input
                      type="text"
                      value={customCountry}
                      onChange={(e) => setCustomCountry(e.target.value)}
                      placeholder="Type country name..."
                      className="mt-1.5 w-full rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  )}
                </div>

                {/* 3. State / Province / Region */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>3. State / Region <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-amber-700 font-semibold lowercase">
                      {currentCountryConfig?.states?.length || 0} regions
                    </span>
                  </label>
                  <select
                    value={state}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-2xs"
                  >
                    {currentCountryConfig?.states?.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.cities.length} cities)
                      </option>
                    ))}
                    <option value="custom">✏️ Enter Custom State/Region...</option>
                  </select>
                  {state === 'custom' && (
                    <input
                      type="text"
                      value={customState}
                      onChange={(e) => setCustomState(e.target.value)}
                      placeholder="Type state/region name..."
                      className="mt-1.5 w-full rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  )}
                </div>

                {/* 4. City / Metro */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    4. City / Metro
                  </label>
                  <input
                    type="text"
                    list="city-suggestions"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Type or pick city..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                  />
                  <datalist id="city-suggestions">
                    {currentStateConfig?.cities?.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
            ) : (
              /* Custom / "Use My Own" Freeform Mode */
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      1. Region / Continent
                    </label>
                    <select
                      value={continent}
                      onChange={(e) => setContinent(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    >
                      {CONTINENTS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.flag} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      2. Custom Country <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customCountry}
                      onChange={(e) => setCustomCountry(e.target.value)}
                      placeholder="e.g. Poland, Switzerland, India, UAE..."
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      3. Custom State / Region <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customState}
                      onChange={(e) => setCustomState(e.target.value)}
                      placeholder="e.g. Mazovia, Canton Zurich, Maharashtra..."
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      4. City / Metro / District
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Warsaw, Zurich Central, Bandra..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-800 bg-amber-50/80 px-3 py-1.5 rounded-lg border border-amber-200/80 font-medium">
                  💡 <strong>Custom Mode Active:</strong> You can enter any country, province, territory, or city across the globe. Google Maps natively resolves specific localities and auto-crawls matching websites.
                </p>
              </div>
            )}
          </div>

          {/* Search Trigger Button & Live Target Preview */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="font-semibold text-slate-500">Live Target:</span>
              <strong className="text-slate-900">{targetQueryDisplay}</strong>
            </div>

            <button
              type="submit"
              disabled={isScraping || !category.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-98"
            >
              {isScraping ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Scraping GMB Profiles...</span>
                </>
              ) : (
                <>
                  <Compass size={16} />
                  <span>Search Google Business Profiles</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Search Status Tracker */}
        {isScraping && (
          <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-950">{scrapeStep}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Scanning Google Maps, extracting reviews and discovering verified contact details. This takes 4–8 seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Import Success Banner */}
        {importSuccess && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    Successfully Imported {importSuccess.importedCount} Leads into Outreach Dashboard!
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    {importSuccess.duplicateCount > 0
                      ? `${importSuccess.duplicateCount} duplicate leads were safely skipped. `
                      : ''}
                    Batch: <span className="font-semibold">{importSuccess.batchName}</span>. Your leads are now active for email, WhatsApp, and campaign scheduling.
                  </p>
                </div>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('crm')}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-2xs cursor-pointer"
                >
                  <span>Open CRM Leads</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scraped Results Section */}
      {scrapedLeads.length > 0 && (
        <div className="space-y-4">
          {/* Metrics & Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Scraped</span>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Verified Emails</span>
              <p className="text-xl font-extrabold text-emerald-900 mt-1">{stats.withEmail}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Phone Numbers</span>
              <p className="text-xl font-extrabold text-blue-900 mt-1">{stats.withPhone}</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Websites</span>
              <p className="text-xl font-extrabold text-purple-900 mt-1">{stats.withWebsite}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Avg Rating</span>
              <p className="text-xl font-extrabold text-amber-900 mt-1">★ {stats.avgRating}</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter size={13} /> Filter:
              </span>
              {(
                [
                  { id: 'all', label: `All (${scrapedLeads.length})` },
                  { id: 'with_email', label: `With Email (${stats.withEmail})` },
                  { id: 'with_phone', label: `With Phone (${stats.withPhone})` },
                  { id: 'with_website', label: `With Website (${stats.withWebsite})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    filterType === f.id
                      ? 'bg-brand-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Selection & Export Tools */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                <strong className="text-slate-800">{selectedIndices.size}</strong> selected
              </span>
              <button
                onClick={handleSelectAll}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 underline"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                title="Export selected leads as CSV"
              >
                <Download size={13} className="text-slate-500" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Import to CRM Panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                <UserPlus size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-950">
                  Ready to Import {selectedIndices.size} Leads into Your CRM
                </h4>
                <p className="text-[11px] text-indigo-700">
                  Imported leads can immediately be queued for multi-channel outreach campaigns and automated follow-ups.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Optional Target List */}
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" />
                <select
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="none">Create New Lead Group / Batch</option>
                  {store.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      Add to List: {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleImportLeads}
                disabled={isImporting || selectedIndices.size === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Import {selectedIndices.size} Leads to CRM</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIndices.size === scrapedLeads.length && scrapedLeads.length > 0}
                        onChange={(e) => (e.target.checked ? handleSelectAll() : handleDeselectAll())}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </th>
                    <th className="py-3 px-4">Business &amp; Reviews</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Direct Phone</th>
                    <th className="py-3 px-4">Verified Email</th>
                    <th className="py-3 px-4">Website &amp; Socials</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead, idx) => {
                    const originalIndex = scrapedLeads.indexOf(lead);
                    const isSelected = selectedIndices.has(originalIndex);

                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(originalIndex)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>

                        {/* Business Name & Reviews */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 text-sm leading-tight">
                              {lead.businessName}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="font-medium text-slate-700">{lead.category}</span>
                              {lead.rating ? (
                                <span className="flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                                  <Star size={10} className="fill-amber-500 text-amber-500" />
                                  <span>{lead.rating}</span>
                                  <span className="text-slate-400 font-normal">({lead.reviewsCount || 0})</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        {/* Address */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="flex items-start gap-1.5 text-slate-600">
                            <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                            <span className="truncate text-xs">{lead.address || 'Local listing'}</span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="font-semibold text-slate-800 hover:text-brand-600 flex items-center gap-1.5"
                            >
                              <Phone size={12} className="text-blue-500" />
                              <span>{lead.phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">No phone</span>
                          )}
                        </td>

                        {/* Discovered Email */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {lead.email ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                <Mail size={12} className="text-emerald-600" />
                                <span>{lead.email}</span>
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="Add email..."
                                onBlur={(e) => handleUpdateLeadEmail(originalIndex, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateLeadEmail(originalIndex, (e.target as HTMLInputElement).value);
                                  }
                                }}
                                className="w-36 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-400 italic">Not on site</span>
                            </div>
                          )}
                        </td>

                        {/* Website & Socials */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="space-y-1">
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1 truncate max-w-48"
                                title={lead.website}
                              >
                                <Globe size={12} className="text-purple-500 shrink-0" />
                                <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                <ExternalLink size={10} className="shrink-0 text-slate-400" />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">No website</span>
                            )}

                            {/* Discovered Socials */}
                            {lead.discoveredSocials && (
                              <div className="flex items-center gap-1.5 pt-0.5">
                                {lead.discoveredSocials.instagram && (
                                  <a
                                    href={lead.discoveredSocials.instagram}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Instagram Profile"
                                    className="text-pink-600 hover:text-pink-700"
                                  >
                                    <Instagram size={13} />
                                  </a>
                                )}
                                {lead.discoveredSocials.facebook && (
                                  <a
                                    href={lead.discoveredSocials.facebook}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Facebook Profile"
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    <Facebook size={13} />
                                  </a>
                                )}
                                {lead.discoveredSocials.linkedin && (
                                  <a
                                    href={lead.discoveredSocials.linkedin}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="LinkedIn Profile"
                                    className="text-sky-600 hover:text-sky-700"
                                  >
                                    <Linkedin size={13} />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Maps Profile Link */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {lead.googleMapsUrl && (
                            <a
                              href={lead.googleMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors shadow-2xs"
                              title="Open listing on Google Maps"
                            >
                              <Compass size={12} className="text-amber-500" />
                              <span>View on Maps</span>
                              <ExternalLink size={11} className="text-slate-400" />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State before any search */}
      {scrapedLeads.length === 0 && !isScraping && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-100 to-orange-100 text-amber-600 mb-4 shadow-2xs">
            <Compass size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-900">Ready to Scrape Google Business Profiles</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Choose a continent, country, state/region, or type your own custom location, then click{' '}
            <span className="font-semibold text-amber-700">"Search Google Business Profiles"</span> to extract fresh leads with phone, email, and website info.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold">
              <Check size={14} className="text-emerald-500" /> 7 Continents &amp; 60+ Countries Preloaded
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold">
              <Check size={14} className="text-emerald-500" /> Custom Country &amp; Region Mode
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold">
              <Check size={14} className="text-emerald-500" /> Direct Phone Numbers &amp; Websites
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold">
              <Check size={14} className="text-emerald-500" /> Website Crawling for Emails
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold">
              <Check size={14} className="text-emerald-500" /> Up to 100 Leads per Batch
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
