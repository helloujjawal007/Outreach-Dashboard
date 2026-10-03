import { Router, type Request, type Response } from 'express';
import { gmbScraperService } from '../services/gmbScraperService';

export const scraperRouter = Router();

// POST /api/scraper/search - Search Google Business Profiles with live email & website crawling
scraperRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { category, country, state, city, limit, continent } = req.body;

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ success: false, error: 'Category is required (e.g., Dentist, Plumber, Real Estate)' });
    }

    if (!state || typeof state !== 'string' || !state.trim()) {
      return res.status(400).json({ success: false, error: 'State / Region is required' });
    }

    const parsedLimit = Math.min(100, Math.max(1, parseInt(String(limit || 10), 10)));

    const leads = await gmbScraperService.searchGmb({
      category: category.trim(),
      country: (country || 'USA').trim(),
      state: state.trim(),
      city: (city || '').trim(),
      limit: parsedLimit,
    });

    res.json({
      success: true,
      query: {
        category,
        continent: continent || undefined,
        country: country || 'USA',
        state,
        city: city || undefined,
        limit: parsedLimit,
      },
      count: leads.length,
      leads,
    });
  } catch (error: any) {
    console.error('[scraperRouter.search] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to scrape Google Business Profiles',
    });
  }
});

// POST /api/scraper/import - Import selected scraped leads directly into Outreach Dashboard database
scraperRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const { leads, listId, batchName } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of leads is required' });
    }

    const result = await gmbScraperService.importScrapedLeads({
      leads,
      listId: listId || undefined,
      batchName: batchName || undefined,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[scraperRouter.import] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to import scraped leads',
    });
  }
});

// GET /api/scraper/presets - Popular presets for fast category & location picking
scraperRouter.get('/presets', (_req: Request, res: Response) => {
  res.json({
    success: true,
    categories: [
      'Plumbing & Heating',
      'Dentist & Dental Clinic',
      'Real Estate & Realtor',
      'Roofing Contractor',
      'HVAC & Air Conditioning',
      'Lawyer & Legal Services',
      'Auto Repair & Mechanic',
      'Gym & Fitness Studio',
      'Digital Marketing Agency',
      'Chiropractor & Wellness',
      'Accounting & CPA',
      'Solar Energy & Electrician',
      'Hair Salon & Spa',
      'Veterinarian & Pet Care',
      'Commercial Cleaning',
    ],
    countries: [
      { code: 'USA', name: 'USA', flag: '🇺🇸', defaultState: 'Texas' },
      { code: 'Canada', name: 'Canada', flag: '🇨🇦', defaultState: 'Ontario' },
      { code: 'United Kingdom', name: 'United Kingdom', flag: '🇬🇧', defaultState: 'England' },
      { code: 'Australia', name: 'Australia', flag: '🇦🇺', defaultState: 'New South Wales' },
      { code: 'India', name: 'India', flag: '🇮🇳', defaultState: 'Maharashtra' },
      { code: 'Germany', name: 'Germany', flag: '🇩🇪', defaultState: 'Bavaria' },
      { code: 'France', name: 'France', flag: '🇫🇷', defaultState: 'Île-de-France' },
    ],
  });
});
