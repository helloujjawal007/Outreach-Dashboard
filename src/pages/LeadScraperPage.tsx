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
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader, type PageId } from '@/components/Sidebar';
import { api } from '@/services/api';
import type { Store } from '@/store';
import type { ScrapedLead, GmbLocationTarget } from '@/types';

interface Props {
  store: Store;
  onNavigate?: (page: PageId) => void;
}

import {
  CONTINENTS,
  COUNTRIES,
  POPULAR_CATEGORIES,
} from '@/data/scraperLocations';

export function LeadScraperPage({ store, onNavigate }: Props) {
  // Search Form State
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Dentist']);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [continent, setContinent] = useState<string>('north_america');
  const [country, setCountry] = useState<string>('USA');
  const [state, setState] = useState<string>('Texas');
  const [city, setCity] = useState<string>('Austin');
  const [customCity, setCustomCity] = useState<string>('');
  const [limit, setLimit] = useState<number>(10);
  const [leadsPerCity, setLeadsPerCity] = useState<number>(0);
  const [leadsPerCityMode, setLeadsPerCityMode] = useState<'auto' | '10' | '20' | 'custom'>('auto');
  const [customLeadsPerCityInput, setCustomLeadsPerCityInput] = useState<string>('');

  // Target Locations Multi-Selection State
  const [targetLocations, setTargetLocations] = useState<GmbLocationTarget[]>([
    {
      country: 'USA',
      state: 'Texas',
      city: 'Austin',
      display: 'Austin, Texas, USA',
    },
  ]);
  const [citySearchFilter, setCitySearchFilter] = useState<string>('');
  const [customLocationInput, setCustomLocationInput] = useState<string>('');

  // Category Multi-Selection Handlers
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === cat.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== cat.toLowerCase());
      } else {
        return [...prev, cat];
      }
    });
  };

  const addCustomCategory = () => {
    const trimmed = customCategoryInput.trim();
    if (!trimmed) return;
    setSelectedCategories((prev) => {
      if (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return prev;
      return [...prev, trimmed];
    });
    setCustomCategoryInput('');
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories([...POPULAR_CATEGORIES]);
  };

  const handleClearAllCategories = () => {
    setSelectedCategories([]);
  };

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
    if (isCustomMode) return city.trim();
    if (city === 'custom') return customCity.trim();
    return city.trim();
  }, [isCustomMode, city, customCity]);

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
        setCustomCity('');
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
        setCustomCity('');
      }
    }
  };

  // When state changes, adapt default city
  const handleStateChange = (newStateName: string) => {
    if (newStateName === 'custom') {
      setState('custom');
      setCity('');
      setCustomCity('');
      setCitySearchFilter('');
      return;
    }
    setState(newStateName);
    const foundState = currentCountryConfig.states.find(
      (s) => s.name.toLowerCase() === newStateName.toLowerCase()
    );
    if (foundState) {
      setCity(foundState.defaultCity || foundState.cities[0] || '');
    } else {
      setCity('');
    }
    setCustomCity('');
    setCitySearchFilter('');
  };

  // Leads Per City quota change handlers
  const handleLeadsPerCityModeChange = (mode: 'auto' | '10' | '20' | 'custom') => {
    setLeadsPerCityMode(mode);
    if (mode === 'auto') {
      setLeadsPerCity(0);
    } else if (mode === '10') {
      setLeadsPerCity(10);
    } else if (mode === '20') {
      setLeadsPerCity(20);
    } else if (mode === 'custom') {
      const parsed = parseInt(customLeadsPerCityInput, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setLeadsPerCity(parsed);
      } else {
        setCustomLeadsPerCityInput('15');
        setLeadsPerCity(15);
      }
    }
  };

  const handleCustomLeadsPerCityChange = (val: string) => {
    setCustomLeadsPerCityInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLeadsPerCity(parsed);
    } else if (val === '') {
      setLeadsPerCity(0);
    }
  };

  // Location Multi-Selection Helpers
  const isCitySelected = (cityName: string) => {
    return targetLocations.some(
      (loc) =>
        loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
        loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
        loc.city?.toLowerCase() === cityName.toLowerCase()
    );
  };

  const toggleCity = (cityName: string) => {
    setTargetLocations((prev) => {
      const exists = prev.some(
        (loc) =>
          loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
          loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
          loc.city?.toLowerCase() === cityName.toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (loc) =>
            !(
              loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
              loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
              loc.city?.toLowerCase() === cityName.toLowerCase()
            )
        );
      } else {
        return [
          ...prev,
          {
            country: effectiveCountry,
            state: effectiveState,
            city: cityName,
            display: `${cityName}, ${effectiveState}, ${effectiveCountry}`,
          },
        ];
      }
    });
  };

  const handleSelectAllCitiesInState = () => {
    if (!currentStateConfig?.cities) return;
    setTargetLocations((prev) => {
      const next = [...prev];
      for (const cityName of currentStateConfig.cities) {
        const alreadyExists = next.some(
          (loc) =>
            loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
            loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
            loc.city?.toLowerCase() === cityName.toLowerCase()
        );
        if (!alreadyExists) {
          next.push({
            country: effectiveCountry,
            state: effectiveState,
            city: cityName,
            display: `${cityName}, ${effectiveState}, ${effectiveCountry}`,
          });
        }
      }
      return next;
    });
  };

  const handleSelectTopMetros = () => {
    if (!currentStateConfig?.cities) return;
    const topCities = currentStateConfig.cities.slice(0, 5);
    setTargetLocations((prev) => {
      const next = [...prev];
      for (const cityName of topCities) {
        const alreadyExists = next.some(
          (loc) =>
            loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
            loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
            loc.city?.toLowerCase() === cityName.toLowerCase()
        );
        if (!alreadyExists) {
          next.push({
            country: effectiveCountry,
            state: effectiveState,
            city: cityName,
            display: `${cityName}, ${effectiveState}, ${effectiveCountry}`,
          });
        }
      }
      return next;
    });
  };

  const handleClearCitiesInState = () => {
    setTargetLocations((prev) =>
      prev.filter(
        (loc) =>
          !(
            loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
            loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
            Boolean(loc.city)
          )
      )
    );
  };

  const handleAddEntireState = () => {
    setTargetLocations((prev) => {
      const exists = prev.some(
        (loc) =>
          loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
          loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
          !loc.city
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          country: effectiveCountry,
          state: effectiveState,
          city: undefined,
          display: `${effectiveState}, ${effectiveCountry} (Entire State)`,
        },
      ];
    });
  };

  const handleAddCustomCity = () => {
    const trimmed = customCity.trim();
    if (!trimmed) return;
    setTargetLocations((prev) => {
      const exists = prev.some(
        (loc) =>
          loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
          loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
          loc.city?.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          country: effectiveCountry,
          state: effectiveState,
          city: trimmed,
          display: `${trimmed}, ${effectiveState}, ${effectiveCountry}`,
        },
      ];
    });
    setCustomCity('');
  };

  const removeLocation = (index: number) => {
    setTargetLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAllLocations = () => {
    setTargetLocations([]);
  };

  const handleAddBulkLocations = () => {
    const raw = customLocationInput.trim();
    if (!raw) return;
    const items = raw.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
    const newItems: GmbLocationTarget[] = [];
    for (const item of items) {
      const parts = item.split(',').map((p) => p.trim()).filter(Boolean);
      let c = effectiveCountry || 'USA';
      let s = effectiveState || '';
      let ct = '';
      if (parts.length === 1) {
        ct = parts[0];
      } else if (parts.length === 2) {
        ct = parts[0];
        s = parts[1];
      } else if (parts.length >= 3) {
        ct = parts[0];
        s = parts[1];
        c = parts[2];
      }
      newItems.push({
        country: c,
        state: s || undefined,
        city: ct || undefined,
        display: item,
      });
    }

    setTargetLocations((prev) => {
      const next = [...prev];
      for (const item of newItems) {
        const exists = next.some((l) => (l.display || '').toLowerCase() === (item.display || '').toLowerCase());
        if (!exists) next.push(item);
      }
      return next;
    });
    setCustomLocationInput('');
  };

  const handleAddSingleCustomLocation = () => {
    if (!customCountry.trim() && !effectiveCountry.trim()) return;
    const c = customCountry.trim() || effectiveCountry;
    const s = customState.trim();
    const ct = city.trim();
    const parts = [ct, s, c].filter(Boolean);
    const display = parts.join(', ');
    setTargetLocations((prev) => {
      const exists = prev.some((l) => (l.display || '').toLowerCase() === display.toLowerCase());
      if (exists) return prev;
      return [
        ...prev,
        {
          country: c,
          state: s || undefined,
          city: ct || undefined,
          display,
        },
      ];
    });
    setCity('');
  };

  const filteredCities = useMemo(() => {
    if (!currentStateConfig?.cities) return [];
    if (!citySearchFilter.trim()) return currentStateConfig.cities;
    const filter = citySearchFilter.toLowerCase().trim();
    return currentStateConfig.cities.filter((c) => c.toLowerCase().includes(filter));
  }, [currentStateConfig, citySearchFilter]);

  const selectedCitiesInCurrentStateCount = useMemo(() => {
    return targetLocations.filter(
      (loc) =>
        loc.country.toLowerCase() === effectiveCountry.toLowerCase() &&
        loc.state?.toLowerCase() === effectiveState.toLowerCase() &&
        Boolean(loc.city)
    ).length;
  }, [targetLocations, effectiveCountry, effectiveState]);

  // Run GMB Scrape
  const handleStartScrape = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedCategories.length === 0) {
      setError('Please select at least one business niche / category (e.g. Plumbing, Dentist, Real Estate)');
      return;
    }

    const locationsToSend: GmbLocationTarget[] =
      targetLocations.length > 0
        ? targetLocations
        : [
            {
              country: effectiveCountry,
              state: effectiveState,
              city: effectiveCity || undefined,
              display: effectiveCity
                ? `${effectiveCity}, ${effectiveState}, ${effectiveCountry}`
                : `${effectiveState}, ${effectiveCountry}`,
            },
          ];

    if (locationsToSend.length === 0 || (!locationsToSend[0].country && !effectiveCountry)) {
      setError('Please select or enter at least one target location.');
      return;
    }

    setError(null);
    setIsScraping(true);
    setImportSuccess(null);
    setScrapeStep('Connecting to Google Business Profiles & Maps engine...');

    try {
      const locSummary =
        locationsToSend.length === 1
          ? (locationsToSend[0].display || locationsToSend[0].city || locationsToSend[0].state || effectiveState)
          : `${locationsToSend.length} locations (${locationsToSend.slice(0, 2).map((l) => l.city || l.state || l.display).join(', ')}${locationsToSend.length > 2 ? '...' : ''})`;

      const stepTimer1 = setTimeout(() => {
        if (selectedCategories.length === 1) {
          setScrapeStep(`Searching verified GMB listings for "${selectedCategories[0]}" across ${locSummary}...`);
        } else {
          setScrapeStep(`Searching verified GMB listings across ${selectedCategories.length} niches in ${locSummary}...`);
        }
      }, 1200);

      const stepTimer2 = setTimeout(() => {
        setScrapeStep('Interpreting business ratings, phone numbers and official websites...');
      }, 3000);

      const stepTimer3 = setTimeout(() => {
        setScrapeStep('Crawling business homepages & contact pages to discover verified emails...');
      }, 5500);

      const res = await api.searchGmbLeads({
        category: selectedCategories.join(', '),
        categories: selectedCategories,
        continent: continent !== 'custom' ? continent : undefined,
        country: locationsToSend[0].country || effectiveCountry,
        state: locationsToSend[0].state || effectiveState || '',
        city: locationsToSend[0].city || effectiveCity || undefined,
        locations: locationsToSend,
        limit,
        leadsPerLocation: leadsPerCity > 0 ? leadsPerCity : undefined,
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
        const catsDisplay =
          selectedCategories.length > 2
            ? `${selectedCategories.slice(0, 2).join(' & ')} +${selectedCategories.length - 2} more`
            : selectedCategories.join(' & ');
        setBatchName(
          `GMB Scrape — ${catsDisplay} in ${locSummary} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
        );
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
      `gmb_leads_${(selectedCategories.join('_') || 'custom').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`
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
    const cat = selectedCategories.length > 0 ? selectedCategories.join(', ') : '...';
    let locDisplay = '';
    if (targetLocations.length === 0) {
      const locParts = [effectiveCity, effectiveState, effectiveCountry].filter(Boolean);
      locDisplay = locParts.join(', ') || 'No location selected';
    } else if (targetLocations.length === 1) {
      locDisplay =
        targetLocations[0].display ||
        [targetLocations[0].city, targetLocations[0].state, targetLocations[0].country]
          .filter(Boolean)
          .join(', ');
    } else if (targetLocations.length <= 3) {
      locDisplay = targetLocations
        .map((l) => l.city || l.state || l.display)
        .filter(Boolean)
        .join('; ');
    } else {
      locDisplay = `${targetLocations
        .slice(0, 2)
        .map((l) => l.city || l.state || l.display)
        .filter(Boolean)
        .join('; ')} +${targetLocations.length - 2} more locations`;
    }
    const contName = CONTINENTS.find((c) => c.id === continent)?.name;
    const perCityStr = leadsPerCity > 0 ? ` • ${leadsPerCity} leads/city` : '';
    return `"${cat}" in ${locDisplay} ${contName && continent !== 'custom' ? `(${contName})` : ''}${perCityStr} • ${limit} leads max`;
  }, [selectedCategories, targetLocations, effectiveCity, effectiveState, effectiveCountry, continent, limit, leadsPerCity]);

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
          {/* Row 1: Multi-Niche Categories & Lead Count */}
          <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Search size={14} className="text-amber-600" />
                  <span>Target Niches / Categories</span>
                  <span className="text-rose-500">*</span>
                </label>
                <span className="rounded-full bg-amber-100 border border-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  {selectedCategories.length} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline transition-colors"
                >
                  Select All ({POPULAR_CATEGORIES.length})
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={handleClearAllCategories}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Active Selected Badges Container */}
            <div className="min-h-[44px] p-2.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center gap-2 shadow-2xs">
              {selectedCategories.length === 0 ? (
                <span className="text-xs text-slate-400 italic">
                  No niches selected. Pick one or more popular niches below, or type a custom niche.
                </span>
              ) : (
                selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2.5 py-1 text-xs font-bold shadow-2xs animate-in fade-in"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="hover:bg-black/20 rounded-full p-0.5 transition-colors"
                      title={`Remove ${cat}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Custom Niche Input & Lead Count */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-5 flex gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomCategory();
                      }
                    }}
                    placeholder="Type custom niche & press Enter (e.g. Electrician, Roofer, Locksmith)..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomCategory}
                  disabled={!customCategoryInput.trim()}
                  className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  + Add Niche
                </button>
              </div>

              <div className="md:col-span-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 min-w-[130px]">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap" title="Maximum total leads to scrape">
                    Total Cap:
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer shadow-2xs"
                  >
                    <option value={10}>10 Leads</option>
                    <option value={20}>20 Leads</option>
                    <option value={40}>40 Leads</option>
                    <option value={60}>60 Leads</option>
                    <option value={80}>80 Leads</option>
                    <option value={100}>100 Leads</option>
                    <option value={120}>120 Leads</option>
                    <option value={140}>140 Leads</option>
                    <option value={160}>160 Leads</option>
                    <option value={180}>180 Leads</option>
                    <option value={200}>200 Leads</option>
                    <option value={220}>220 Leads</option>
                    <option value={240}>240 Leads</option>
                    <option value={260}>260 Leads</option>
                    <option value={280}>280 Leads</option>
                    <option value={300}>300 Leads</option>
                  </select>
                </div>

                {/* Option to choose leads per city / location (10, 20, Custom input) */}
                <div className="flex-1 flex items-center gap-1.5 bg-amber-50/80 border border-amber-300/80 px-2.5 py-1.5 rounded-xl shadow-2xs min-w-[180px]">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-950 whitespace-nowrap" title="Limit how many leads to collect from each city or region">
                    Per City:
                  </label>
                  <select
                    value={leadsPerCityMode}
                    onChange={(e) => handleLeadsPerCityModeChange(e.target.value as any)}
                    className="flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-950 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-all cursor-pointer shadow-2xs"
                  >
                    <option value="auto">Auto / All (Up to Cap)</option>
                    <option value="10">10 leads / city</option>
                    <option value="20">20 leads / city</option>
                    <option value="custom">✏️ Custom...</option>
                  </select>
                  {leadsPerCityMode === 'custom' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={limit}
                        value={customLeadsPerCityInput}
                        onChange={(e) => handleCustomLeadsPerCityChange(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-14 rounded-lg border border-amber-400 bg-white px-1.5 py-1 text-xs font-bold text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        title="Type custom leads per city limit"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Popular Niches Toggle Pills */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Click to toggle popular niches:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {POPULAR_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.some((c) => c.toLowerCase() === cat.toLowerCase());
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-100 text-amber-900 border border-amber-400 font-bold shadow-2xs ring-1 ring-amber-400/40'
                          : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                      }`}
                    >
                      {isSelected && <Check size={12} className="text-amber-700 shrink-0" />}
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
                  {state !== 'custom' && (
                    <button
                      type="button"
                      onClick={handleAddEntireState}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 hover:bg-amber-100/90 py-1.5 px-2 text-[11px] font-bold text-amber-800 transition-colors shadow-2xs cursor-pointer"
                      title={`Queue entire ${state} region`}
                    >
                      <Plus size={13} />
                      <span>+ Add Entire {state}</span>
                    </button>
                  )}
                </div>

                {/* 4. City / Metro Multi-Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      4. City / Metro
                    </span>
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-100/80 px-1.5 py-0.5 rounded">
                      {selectedCitiesInCurrentStateCount > 0
                        ? `${selectedCitiesInCurrentStateCount} selected in ${state}`
                        : `${currentStateConfig?.cities?.length || 0} cities`}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={citySearchFilter}
                        onChange={(e) => setCitySearchFilter(e.target.value)}
                        placeholder={`Filter ${currentStateConfig?.cities?.length || 0} cities...`}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-7 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all shadow-2xs"
                      />
                      {citySearchFilter && (
                        <button
                          type="button"
                          onClick={() => setCitySearchFilter('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={handleSelectAllCitiesInState}
                        className="px-1.5 py-0.5 rounded text-amber-700 font-semibold hover:bg-amber-100/70 transition-colors cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleSelectTopMetros}
                        className="px-1.5 py-0.5 rounded text-amber-700 font-semibold hover:bg-amber-100/70 transition-colors cursor-pointer"
                      >
                        Top 5 Metros
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleClearCitiesInState}
                        className="px-1.5 py-0.5 rounded text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        Clear State
                      </button>
                    </div>

                    {/* Interactive scrollable city selection box */}
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 space-y-0.5 shadow-2xs">
                      {filteredCities.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-slate-400">
                          No cities match &ldquo;{citySearchFilter}&rdquo;
                        </div>
                      ) : (
                        filteredCities.map((cityName) => {
                          const isSelected = isCitySelected(cityName);
                          return (
                            <button
                              key={cityName}
                              type="button"
                              onClick={() => toggleCity(cityName)}
                              className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-lg transition-colors text-left cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-100 text-amber-950 font-bold border border-amber-300/80'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              <span className="truncate">{cityName}</span>
                              {isSelected ? (
                                <Check size={12} className="text-amber-700 shrink-0 ml-1" />
                              ) : (
                                <Plus size={11} className="text-slate-300 opacity-60 shrink-0 ml-1" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Add Custom City to Current State */}
                    <div className="flex gap-1 pt-0.5">
                      <input
                        type="text"
                        value={customCity}
                        onChange={(e) => setCustomCity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomCity();
                          }
                        }}
                        placeholder="Other city name..."
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomCity}
                        disabled={!customCity.trim()}
                        className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Custom / "Use My Own" Freeform Mode */
              <div className="space-y-3.5">
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
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      3. Custom State / Region
                    </label>
                    <input
                      type="text"
                      value={customState}
                      onChange={(e) => setCustomState(e.target.value)}
                      placeholder="e.g. Mazovia, Canton Zurich, Maharashtra..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      4. City / Metro / District
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSingleCustomLocation();
                          }
                        }}
                        placeholder="e.g. Warsaw, Zurich Central..."
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddSingleCustomLocation}
                        disabled={!city.trim() && !customState.trim()}
                        className="rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-3 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bulk Paste Custom Locations */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-500" />
                      <span>Bulk Add Multiple Locations</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Separate by commas, semicolons, or new lines
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customLocationInput}
                      onChange={(e) => setCustomLocationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddBulkLocations();
                        }
                      }}
                      placeholder="e.g. Austin, TX; Dallas, TX; Miami, FL; Denver, CO"
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleAddBulkLocations}
                      disabled={!customLocationInput.trim()}
                      className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      + Add All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Active Selected Locations Tray */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <MapPin size={13} className="text-amber-600" />
                    <span>Selected Target Locations</span>
                  </span>
                  <span className="rounded-full bg-amber-500 text-white px-2 py-0.2 text-[10px] font-bold">
                    {targetLocations.length}
                  </span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    (Scraper will search across each selected location)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-lg shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 whitespace-nowrap">
                      Leads / City:
                    </span>
                    <select
                      value={leadsPerCityMode}
                      onChange={(e) => handleLeadsPerCityModeChange(e.target.value as any)}
                      className="bg-transparent text-xs font-bold text-amber-950 focus:outline-none cursor-pointer"
                    >
                      <option value="auto">Auto (up to cap)</option>
                      <option value="10">10 / city</option>
                      <option value="20">20 / city</option>
                      <option value="custom">✏️ Custom...</option>
                    </select>
                    {leadsPerCityMode === 'custom' && (
                      <input
                        type="number"
                        min={1}
                        max={limit}
                        value={customLeadsPerCityInput}
                        onChange={(e) => handleCustomLeadsPerCityChange(e.target.value)}
                        placeholder="Qty"
                        className="w-12 rounded border border-amber-400 bg-white px-1 py-0.5 text-xs font-bold text-amber-950 focus:outline-none"
                      />
                    )}
                  </div>
                  {targetLocations.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllLocations}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Clear All ({targetLocations.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {targetLocations.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                  {targetLocations.map((loc, idx) => (
                    <span
                      key={`${loc.display || loc.city || loc.state}-${idx}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-950 border border-amber-300 px-2.5 py-1 text-xs font-semibold shadow-2xs"
                    >
                      <MapPin size={11} className="text-amber-600 shrink-0" />
                      <span className="max-w-[220px] truncate">
                        {loc.display || [loc.city, loc.state, loc.country].filter(Boolean).join(', ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLocation(idx)}
                        className="text-amber-700 hover:text-rose-600 hover:bg-rose-50 rounded p-0.5 transition-colors cursor-pointer ml-0.5"
                        title="Remove location"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-300/80 bg-amber-50/50 p-2.5 text-center text-xs text-amber-900">
                  📍 No specific cities queued yet. Click any city pill above or &ldquo;+ Add Entire State&rdquo; to target multiple locations, or search will default to <strong className="font-semibold">{effectiveState}, {effectiveCountry}</strong>.
                </div>
              )}
            </div>
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
              disabled={isScraping || selectedCategories.length === 0}
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
                  <span>
                    Search Google Business Profiles ({selectedCategories.length} {selectedCategories.length === 1 ? 'Niche' : 'Niches'})
                  </span>
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
                    <th className="py-3 px-4">Website</th>
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

                        {/* Website */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {lead.website ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1 truncate max-w-56"
                                title={lead.website}
                              >
                                <Globe size={12} className="text-purple-500 shrink-0" />
                                <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                <ExternalLink size={10} className="shrink-0 text-slate-400" />
                              </a>
                              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0" title="Website link was opened and verified live in backend">
                                <CheckCircle2 size={9} className="text-emerald-500" /> Live
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No verified website</span>
                          )}
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
