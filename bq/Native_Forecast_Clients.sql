-- filepath: bq/Native_Forecast_Clients.sql
-- NATIVE plus client attributes (status, tier, hidden, Billups eligibility) from the client sheet. Reads NATIVE; read by KPI_BY_CLIENT.
-- Versioned 2026-11-26 from the SQL BigQuery last ran (job history), as run for the Nov 2026 MIR.
CREATE OR REPLACE TABLE `plusco-media-invest-solutions.PCC_Media_Investment.Native_Forecast_Clients` AS

WITH base AS (
  SELECT
    -- Key dimensions: prefer client sheet when available
    COALESCE(n.PLUSCO_CLIENT_ID, c.CL_ID)                  AS PLUSCO_CLIENT_ID,
    COALESCE(n.PLUSCO_CLIENT_NAME, c.CL_Name)              AS PLUSCO_CLIENT_NAME,
    COALESCE(n.AGENCY, c.CL_Agency)                        AS AGENCY,
    COALESCE(n.BU_REGION, c.CL_Business_Unit_Region)       AS BU_REGION,
    COALESCE(n.BUSINESS_LEAD, c.CL_Business_Lead)          AS BUSINESS_LEAD,
    COALESCE(n.GM_POD, c.GM_Pod)                           AS GM_POD,

    COALESCE(
      NULLIF(TRIM(c.Client_Status_2026), ''),
      n.CLIENT_STATUS_IN_2026
    ) AS CLIENT_STATUS_IN_2026,

    c.Hide_Unhide,

    n.* EXCEPT (
      PLUSCO_CLIENT_ID, PLUSCO_CLIENT_NAME, AGENCY, BU_REGION,
      BUSINESS_LEAD, GM_POD, CLIENT_STATUS_IN_2026
    ),

    CASE
      WHEN COALESCE(TRIM(c.Eligible_Billups_OOH), '') = '' THEN 'Yes'
      ELSE c.Eligible_Billups_OOH
    END AS Eligible_Billups_OOH,
    CASE
      WHEN COALESCE(TRIM(c.Eligible_Billups_PRINT), '') = '' THEN 'Yes'
      ELSE c.Eligible_Billups_PRINT
    END AS Eligible_Billups_PRINT,

    c.CL_Tier,
    c.Client_Notes       AS CL_Client_Notes,
    c.Scenario

  -- *** KEY CHANGE: NATIVE is now the driving table ***
  FROM `plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE` AS n
  LEFT JOIN `plus-collect.mediabox.forecast_clients` AS c
    ON c.CL_ID = n.PLUSCO_CLIENT_ID
   AND n.PLUSCO_CLIENT_ID != '-'
)

SELECT
  b.*,
  CASE
    WHEN SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'OOH'
      THEN NET_ORDERED_CAD ELSE 0
    END) OVER (PARTITION BY PLUSCO_CLIENT_ID) > 0
    THEN 'Has Billups-OOH Spend'
    ELSE 'No Billups-OOH Spend'
  END AS Billups_OOH_Spend_Flag,
  CASE
    WHEN SUM(CASE
      WHEN UPPER(PLUSCO_MEDIA_PARTNER) = 'BILLUPS'
        AND UPPER(PLUSCO_MEDIA_CHANNEL) = 'PRINT'
      THEN NET_ORDERED_CAD ELSE 0
    END) OVER (PARTITION BY PLUSCO_CLIENT_ID) > 0
    THEN 'Has Billups-PRINT Spend'
    ELSE 'No Billups-PRINT Spend'
  END AS Billups_PRINT_Spend_Flag

FROM base AS b
