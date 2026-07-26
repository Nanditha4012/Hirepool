'use strict';

/**
 * Seeds companies_master with well-known real companies and their
 * is_mnc / is_faang_maang flags:
 *   - FAANG/MAANG: is_faang_maang = true (and, being large multinationals,
 *     is_mnc = true too)
 *   - Other large, established multinational tech/consulting/enterprise
 *     companies: is_mnc = true, is_faang_maang = false
 *   - Well-known but non-MNC-scale startups/unicorns: both false
 * `id` is omitted so gen_random_uuid() populates it.
 */

const FAANG_MAANG = [
  'Google',
  'Meta',
  'Amazon',
  'Apple',
  'Netflix',
  'Microsoft',
].map((company_name) => ({ company_name, is_mnc: true, is_faang_maang: true }));

const OTHER_MNCS = [
  'TCS',
  'Infosys',
  'Wipro',
  'Accenture',
  'IBM',
  'Oracle',
  'SAP',
  'Cisco',
  'Adobe',
  'Salesforce',
  'Cognizant',
  'Capgemini',
  'HCLTech',
  'Tech Mahindra',
  'Dell',
  'HP',
  'Intel',
  'Samsung',
  'Sony',
  'Deloitte',
  'JPMorgan Chase',
  'Goldman Sachs',
  'VMware',
  'Qualcomm',
  'ServiceNow',
].map((company_name) => ({ company_name, is_mnc: true, is_faang_maang: false }));

const STARTUPS = [
  'Razorpay',
  'Zerodha',
  'Swiggy',
  'Zomato',
  'Postman',
  'Freshworks',
  'PhonePe',
  'CRED',
  'Meesho',
  'Groww',
  'Unacademy',
  'Udaan',
  "BYJU'S",
  'Ola',
  'Paytm',
].map((company_name) => ({ company_name, is_mnc: false, is_faang_maang: false }));

const ROWS = [...FAANG_MAANG, ...OTHER_MNCS, ...STARTUPS];

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('companies_master', ROWS);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('companies_master', {
      company_name: ROWS.map((r) => r.company_name),
    });
  },
};
