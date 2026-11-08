/**
 * Centralized Sender & Agency Configuration Source
 * Single source of truth for all outbound channels, signatures, and document headers/footers.
 */

export const SENDER_CONFIG = {
  // Identity
  name: 'Cloud Consultancy',
  email: 'cloudconsultancy.ad@gmail.com',
  displayName: 'Cloud Consultancy Advisory Team',
  signatureTitle: 'Systems & Architecture Advisory',
  company: 'Cloud Consultancy',
  website: 'https://cloudconsultancy.in',

  // Delivery & Public Gateway
  publicAppUrl: process.env.PUBLIC_APP_URL || 'https://outreach.cloudconsultancy.in',
  fromAddress: '"Cloud Consultancy" <cloudconsultancy.ad@gmail.com>',
  replyTo: 'cloudconsultancy.ad@gmail.com',

  // PDF Document Metadata & Footer
  pdfFooterText: 'Prepared by Cloud Consultancy • Systems & Architecture Advisory • cloudconsultancy.ad@gmail.com',
  pdfHeaderTitle: 'Cloud Consultancy - Technical Review & Audit Memo',

  // Physical Compliance Address
  physicalAddress: 'DLF Cyber City, Tower B, Level 5, Gurugram, HR 122002, India',
} as const;

