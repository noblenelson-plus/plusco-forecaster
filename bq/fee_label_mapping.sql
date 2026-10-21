-- plusco-media-invest-solutions.Finance_mediabox.fee_label_mapping — MediaBox fee label
-- (value_category of mediabox-1cd44.mediabox_3.finance) → cost bucket, read by
-- Concatenated_finance_table step 1. Matching is case/whitespace-insensitive; a label
-- not listed is "Other fees". Edit rows in place to remap a label (re-run this to reset).
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.Finance_mediabox.fee_label_mapping` AS
SELECT * FROM UNNEST([
  STRUCT('media_budget_ref_currency' AS value_category, 'Planned Net' AS cost_bucket, 'Monthly tactic net media budget' AS note),
  ('Commission',                     'Commission', ''),
  ('Commission / Monks',             'Commission', 'BRP Unit'),
  ('Commission et frais de gestion', 'Commission', 'CAG agencies; FR label, includes management fees'),
  ('Taxes',                          'Taxes', ''),
  ('Taxes gouvernementales',         'Taxes', 'FR "government taxes"'),
  ('Government taxes',               'Taxes', '123Dentist'),
  ('Taxes Ontario',                  'Taxes', ''),
  ('Taxe UL',                        'Taxes', 'Université Laval only - to confirm'),
  ('Taxe TSN',                       'Taxes', 'CPA only - to confirm')
]);
