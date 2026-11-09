import "dotenv/config";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the .env file`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: need("DATABASE_URL"),
  jwtSecret: need("JWT_SECRET"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  selcomBaseUrl: process.env.SELCOM_BASE_URL ?? "https://apigw.selcommobile.com",
  selcomApiKey: process.env.SELCOM_API_KEY,
  selcomApiSecret: process.env.SELCOM_API_SECRET,
  selcomVendor: process.env.SELCOM_VENDOR,
  selcomFloatPin: process.env.SELCOM_FLOAT_PIN,
  selcomPayoutSenderAccount: process.env.SELCOM_PAYOUT_SENDER_ACCOUNT,
  selcomPayoutSenderName: process.env.SELCOM_PAYOUT_SENDER_NAME,
  selcomBankVendor: process.env.SELCOM_BANK_VENDOR,
  selcomCollectionWebhookUrl: process.env.SELCOM_COLLECTION_WEBHOOK_URL,
  bankPaymentName: process.env.BML_BANK_PAYMENT_NAME,
  bankPaymentAccount: process.env.BML_BANK_PAYMENT_ACCOUNT,
  bankPaymentBank: process.env.BML_BANK_PAYMENT_BANK,
};