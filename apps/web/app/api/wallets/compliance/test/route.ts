import { z } from "zod";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { verifyWalletMessageSignature } from "@/lib/signature-verifier";

const signatureMetadataSchema = z.object({
  crypto_alg: z.enum(["eip712", "cip8", "bip322"]),
  pub_key: z.string().optional(),
  public_key: z.string().optional(),
  key: z.string().optional()
});

const walletAbstractionSchema = z.record(z.string(), z.unknown());

const schema = z.object({
  chain: z.enum(["evm", "cardano", "bitcoin"]),
  wallet_address: z.string().min(4),
  message: z.string().min(1),
  signature: z.string().min(8),
  wallet_abstraction: walletAbstractionSchema.optional(),
  signature_metadata: signatureMetadataSchema
});

const expectedAlgorithmByChain = {
  evm: "eip712",
  cardano: "cip8",
  bitcoin: "bip322"
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseJson(request, schema);
    const publicKey = body.signature_metadata.public_key ?? body.signature_metadata.pub_key;
    const expectedAlgorithm = expectedAlgorithmByChain[body.chain];

    if (body.signature_metadata.crypto_alg !== expectedAlgorithm) {
      return jsonResponse({
        ok: true,
        compliant: false,
        reason: `crypto_alg ${body.signature_metadata.crypto_alg} does not match chain ${body.chain}`,
        wallet_abstraction: {
          provided: Boolean(body.wallet_abstraction)
        },
        signature: {
          verified: false,
          crypto_alg: body.signature_metadata.crypto_alg,
          public_key: publicKey ?? null
        }
      });
    }

    const verification = await verifyWalletMessageSignature({
      chain: body.chain,
      walletAddress: body.wallet_address,
      message: body.message,
      signature: body.signature,
      signingScheme: body.signature_metadata.crypto_alg,
      key: body.signature_metadata.key,
      publicKey
    });

    return jsonResponse({
      ok: true,
      compliant: verification.ok,
      reason: verification.ok ? null : (verification.reason ?? "Signature verification failed"),
      wallet_abstraction: {
        provided: Boolean(body.wallet_abstraction)
      },
      signature: {
        verified: verification.ok,
        crypto_alg: body.signature_metadata.crypto_alg,
        public_key: publicKey ?? null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid wallet compliance test payload", 400, error.flatten());
    }

    return errorResponse(error instanceof Error ? error.message : "Wallet compliance test failed", 400);
  }
}
