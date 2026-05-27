export interface ForecastRow {
  id: string;
  FO_Client: string;
  FO_Submission: string;
  FO_Type: string;
  FO_Channel: string;
  FO_Project: string;
  FO_Partner: string;
  FO_Comment: string;
  FO_Product?: string;
  FO_Description?: string;
  [key: string]: any;
}

export const MONTH_FIELDS = [
  'FO_Spend_Jan', 'FO_Spend_Feb', 'FO_Spend_Mar', 'FO_Spend_Apr',
  'FO_Spend_May', 'FO_Spend_Jun', 'FO_Spend_Jul', 'FO_Spend_Aug',
  'FO_Spend_Sep', 'FO_Spend_Oct', 'FO_Spend_Nov', 'FO_Spend_Dec'
];

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];