import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default é 1MB — CCB/contrato de financiamento (PDF/foto) sobe em
      // base64 via Server Action (`parseFinancingDocumentAction`,
      // `app/(app)/financings/actions.ts`), que já infla o tamanho em ~33%;
      // 10mb cobre o documento real (bancário, poucos MB) + a folga do
      // encoding, sem abrir a porta pra upload arbitrariamente grande.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
