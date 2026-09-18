export interface WhatsAppEligibilityResult {
  isEligible: boolean;
  phoneType: 'mobile' | 'landline' | 'explicit' | 'toll_free' | 'unknown' | 'none';
  reason: string;
  cleanNumber: string;
  formattedInternational: string;
  deepLink: string;
}

export class WhatsAppValidator {
  /**
   * Normalizes a phone string by stripping non-digit characters while preserving country prefix
   */
  public cleanPhoneDigits(raw: string): string {
    if (!raw) return '';
    return raw.replace(/[^\d+]/g, '');
  }

  /**
   * Evaluates whether a phone number or contact record is eligible for WhatsApp messaging
   */
  public evaluate(contact: { phone?: string; whatsapp?: string }): WhatsAppEligibilityResult {
    const rawWa = (contact.whatsapp || '').trim();
    const rawPhone = (contact.phone || '').trim();

    // 1. Explicit WhatsApp number override
    if (rawWa) {
      const cleanWa = rawWa.replace(/\D/g, '');
      if (cleanWa.length >= 7) {
        return {
          isEligible: true,
          phoneType: 'explicit',
          reason: 'Explicit WhatsApp number configured',
          cleanNumber: cleanWa,
          formattedInternational: `+${cleanWa}`,
          deepLink: `https://wa.me/${cleanWa}`,
        };
      }
    }

    // 2. Check if phone is present
    if (!rawPhone) {
      return {
        isEligible: false,
        phoneType: 'none',
        reason: 'No phone number provided',
        cleanNumber: '',
        formattedInternational: '',
        deepLink: '',
      };
    }

    const digitsOnly = rawPhone.replace(/\D/g, '');
    const cleanWithPlus = rawPhone.replace(/[^\d+]/g, '');

    // 3. Explicit Country Code with "+" Prefix
    if (cleanWithPlus.startsWith('+')) {
      // +91 India
      if (cleanWithPlus.startsWith('+91')) {
        const after91 = digitsOnly.slice(2);
        if (/^[6-9]\d{9}$/.test(after91)) {
          return {
            isEligible: true,
            phoneType: 'mobile',
            reason: 'India Mobile (+91) — WhatsApp Ready',
            cleanNumber: `91${after91}`,
            formattedInternational: `+91 ${after91.slice(0, 5)} ${after91.slice(5)}`,
            deepLink: `https://wa.me/91${after91}`,
          };
        }
        if (/^[1-5]\d{7,9}$/.test(after91)) {
          return {
            isEligible: false,
            phoneType: 'landline',
            reason: 'India Landline (+91) — Cannot receive WhatsApp',
            cleanNumber: digitsOnly,
            formattedInternational: `+91 ${after91}`,
            deepLink: '',
          };
        }
      }

      // +1 North America (US / Canada)
      if (cleanWithPlus.startsWith('+1')) {
        const after1 = digitsOnly.slice(1);
        if (/^[8](?:00|88|77|66|55|44|33)\d{7}$/.test(after1)) {
          return {
            isEligible: false,
            phoneType: 'toll_free',
            reason: 'North American Toll-Free — Cannot receive WhatsApp',
            cleanNumber: digitsOnly,
            formattedInternational: `+1 ${after1.slice(0, 3)}-${after1.slice(3, 6)}-${after1.slice(6)}`,
            deepLink: '',
          };
        }
        if (after1.length === 10) {
          return {
            isEligible: true,
            phoneType: 'mobile',
            reason: 'North American Number (+1) — WhatsApp Capable',
            cleanNumber: `1${after1}`,
            formattedInternational: `+1 ${after1.slice(0, 3)}-${after1.slice(3, 6)}-${after1.slice(6)}`,
            deepLink: `https://wa.me/1${after1}`,
          };
        }
      }

      // +61 Australia
      if (cleanWithPlus.startsWith('+61')) {
        const after61 = digitsOnly.slice(2);
        if (/^4\d{8}$/.test(after61)) {
          return {
            isEligible: true,
            phoneType: 'mobile',
            reason: 'Australian Mobile (+61 4xx) — WhatsApp Ready',
            cleanNumber: `61${after61}`,
            formattedInternational: `+61 ${after61.slice(0, 3)} ${after61.slice(3, 6)} ${after61.slice(6)}`,
            deepLink: `https://wa.me/61${after61}`,
          };
        }
        if (/^[2378]\d{8}$/.test(after61)) {
          return {
            isEligible: false,
            phoneType: 'landline',
            reason: 'Australian Landline (+61) — Cannot receive WhatsApp',
            cleanNumber: digitsOnly,
            formattedInternational: `+61 ${after61}`,
            deepLink: '',
          };
        }
      }

      // +44 United Kingdom
      if (cleanWithPlus.startsWith('+44')) {
        const after44 = digitsOnly.slice(2);
        if (/^7\d{9}$/.test(after44)) {
          return {
            isEligible: true,
            phoneType: 'mobile',
            reason: 'UK Mobile (+44 7xx) — WhatsApp Ready',
            cleanNumber: `44${after44}`,
            formattedInternational: `+44 ${after44.slice(0, 4)} ${after44.slice(4)}`,
            deepLink: `https://wa.me/44${after44}`,
          };
        }
        if (/^[12]\d{8,9}$/.test(after44)) {
          return {
            isEligible: false,
            phoneType: 'landline',
            reason: 'UK Landline (+44) — Cannot receive WhatsApp',
            cleanNumber: digitsOnly,
            formattedInternational: `+${digitsOnly}`,
            deepLink: '',
          };
        }
      }

      // Other explicit international country code (+XX...)
      if (digitsOnly.length >= 9 && digitsOnly.length <= 15) {
        return {
          isEligible: true,
          phoneType: 'mobile',
          reason: 'International Mobile Format — WhatsApp Ready',
          cleanNumber: digitsOnly,
          formattedInternational: `+${digitsOnly}`,
          deepLink: `https://wa.me/${digitsOnly}`,
        };
      }
    }

    // 4. Australian Local Numbers without +
    // AU Mobiles: 04xx xxx xxx (10 digits) or 614xx xxx xxx
    if (/^04\d{8}$/.test(digitsOnly) || /^614\d{8}$/.test(digitsOnly)) {
      const intlNumber = digitsOnly.startsWith('0') ? '61' + digitsOnly.slice(1) : digitsOnly;
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'Australian Mobile (04xx) — WhatsApp Ready',
        cleanNumber: intlNumber,
        formattedInternational: `+${intlNumber}`,
        deepLink: `https://wa.me/${intlNumber}`,
      };
    }

    // AU Landlines: 02, 03, 07, 08
    if (/^0[2378]\d{8}$/.test(digitsOnly) || /^61[2378]\d{8}$/.test(digitsOnly)) {
      const area = digitsOnly.startsWith('61') ? digitsOnly.substring(2, 3) : digitsOnly.substring(1, 2);
      const stateName =
        area === '2' ? 'NSW/ACT' : area === '3' ? 'VIC/TAS' : area === '7' ? 'QLD' : 'SA/WA/NT';
      return {
        isEligible: false,
        phoneType: 'landline',
        reason: `Australian Landline (0${area} ${stateName}) — Cannot receive WhatsApp`,
        cleanNumber: digitsOnly,
        formattedInternational: digitsOnly.startsWith('61') ? `+${digitsOnly}` : `+61${digitsOnly.replace(/^0/, '')}`,
        deepLink: '',
      };
    }

    // 5. UK Local Numbers without +
    if (/^07\d{9}$/.test(digitsOnly) || /^447\d{9}$/.test(digitsOnly)) {
      const intlNumber = digitsOnly.startsWith('0') ? '44' + digitsOnly.slice(1) : digitsOnly;
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'UK Mobile (07xx) — WhatsApp Ready',
        cleanNumber: intlNumber,
        formattedInternational: `+${intlNumber}`,
        deepLink: `https://wa.me/${intlNumber}`,
      };
    }
    if (/^0[12]\d{8,9}$/.test(digitsOnly)) {
      return {
        isEligible: false,
        phoneType: 'landline',
        reason: 'UK Landline — Cannot receive WhatsApp',
        cleanNumber: digitsOnly,
        formattedInternational: `+${digitsOnly}`,
        deepLink: '',
      };
    }

    // 6. Indian Numbers with 91 prefix or 0-prefix (12 or 11 digits)
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.slice(2))) {
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'India Mobile (91) — WhatsApp Ready',
        cleanNumber: digitsOnly,
        formattedInternational: `+91 ${digitsOnly.slice(2, 7)} ${digitsOnly.slice(7)}`,
        deepLink: `https://wa.me/${digitsOnly}`,
      };
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.slice(1))) {
      const intlNumber = `91${digitsOnly.slice(1)}`;
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'India Mobile (0xx) — WhatsApp Ready',
        cleanNumber: intlNumber,
        formattedInternational: `+91 ${digitsOnly.slice(1, 6)} ${digitsOnly.slice(6)}`,
        deepLink: `https://wa.me/${intlNumber}`,
      };
    }

    // 7. North American Numbers (US / Canada)
    // Toll-Free prefixes: 800, 888, 877, 866, 855, 844, 833
    if (/^(?:1)?[8](?:00|88|77|66|55|44|33)\d{7}$/.test(digitsOnly)) {
      return {
        isEligible: false,
        phoneType: 'toll_free',
        reason: 'North American Toll-Free — Cannot receive WhatsApp',
        cleanNumber: digitsOnly,
        formattedInternational: `+1 ${digitsOnly.slice(-10, -7)}-${digitsOnly.slice(-7, -4)}-${digitsOnly.slice(-4)}`,
        deepLink: '',
      };
    }

    // 11 digits starting with 1 (e.g. 19027064999)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'North American Number (11 digits) — WhatsApp Capable',
        cleanNumber: digitsOnly,
        formattedInternational: `+1 ${digitsOnly.slice(1, 4)}-${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`,
        deepLink: `https://wa.me/${digitsOnly}`,
      };
    }

    // 10-digit numbers: check North American formatting (e.g. 918-505-7332, (208) 481-5722)
    // or standard 10-digit NANP area code pattern
    if (digitsOnly.length === 10) {
      // If explicitly formatted as Indian 5-5 split (e.g. 98313 63981 or 98313-63981)
      if (/^[6-9]\d{4}[-\s]\d{5}$/.test(rawPhone.trim())) {
        const intlNumber = `91${digitsOnly}`;
        return {
          isEligible: true,
          phoneType: 'mobile',
          reason: 'India Mobile (10 digits) — WhatsApp Ready',
          cleanNumber: intlNumber,
          formattedInternational: `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`,
          deepLink: `https://wa.me/${intlNumber}`,
        };
      }

      // By default in North American context (or formatted with 3-3-4 pattern like 918-505-7332)
      return {
        isEligible: true,
        phoneType: 'mobile',
        reason: 'North American Number (10 digits) — WhatsApp Capable',
        cleanNumber: `1${digitsOnly}`,
        formattedInternational: `+1 ${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`,
        deepLink: `https://wa.me/1${digitsOnly}`,
      };
    }

    // 8. Unclassified or short number
    return {
      isEligible: false,
      phoneType: 'unknown',
      reason: digitsOnly.length < 8 ? 'Phone number too short for WhatsApp' : 'Unverified phone format (likely landline)',
      cleanNumber: digitsOnly,
      formattedInternational: digitsOnly ? `+${digitsOnly}` : '',
      deepLink: '',
    };
  }

  /**
   * Builds direct WhatsApp Web or Mobile click-to-chat URL with pre-filled message text
   */
  public buildWhatsAppUrl(cleanNumber: string, messageText?: string): string {
    if (!cleanNumber) return '';
    const baseUrl = `https://wa.me/${cleanNumber}`;
    if (!messageText) return baseUrl;
    return `${baseUrl}?text=${encodeURIComponent(messageText)}`;
  }
}

export const whatsappValidator = new WhatsAppValidator();

export function validatePhoneNumber(phone: string) {
  const res = whatsappValidator.evaluate({ phone });
  return {
    isMobileReady: res.isEligible,
    phoneType: res.phoneType,
    reason: res.reason,
    cleanNumber: res.cleanNumber,
    formattedInternational: res.formattedInternational,
    deepLink: res.deepLink,
  };
}
