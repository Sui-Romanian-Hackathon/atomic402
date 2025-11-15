"use client";

import { useState } from "react";
import { Header } from "../components/Header";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Loader2, FileText, DollarSign, Lock } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Transaction } from "@mysten/sui/transactions";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || "";

export default function CreatePage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } =
    useSignAndExecuteTransaction();
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    content: "",
    price: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account?.address) {
      toast.error("Please connect your wallet first");
      return;
    }

    // Validate form
    if (
      !formData.title ||
      !formData.description ||
      !formData.content ||
      !formData.price
    ) {
      toast.error("Please fill in all fields");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setIsCreating(true);
    const toastId = toast.loading("Building transaction...");

    try {
      // Convert SUI to MIST (1 SUI = 1,000,000,000 MIST)
      const priceInMist = Math.floor(price * 1_000_000_000);

      // Build transaction to create content on-chain
      const tx = new Transaction();

      tx.moveCall({
        target: `${PACKAGE_ID}::content_access::create_content`,
        arguments: [
          tx.pure.string(formData.title),
          tx.pure.string(formData.description),
          tx.pure.u64(BigInt(priceInMist)),
          tx.pure.string(""), // contentUrl
        ],
      });

      // Set the sender (creator pays gas)
      tx.setSender(account.address);

      toast.loading("Waiting for wallet signature...", { id: toastId });

      // Serialize transaction to bytes
      const txBytes = await tx.build({ client: suiClient as any });
      const base64Tx = Buffer.from(txBytes).toString("base64");

      // Sign and execute transaction
      const result = await signAndExecuteTransaction(
        {
          transaction: base64Tx,
          account: account,
          chain: "sui:testnet",
        },
        {
          onSuccess: (result) => {
            console.log("Transaction successful:", result);
          },
        }
      );

      if (!result.digest) {
        throw new Error("Transaction failed");
      }

      toast.loading("Extracting content ID...", { id: toastId });

      // Wait a moment for transaction to be indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Query the transaction to get the created objects
      const txResponse = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // Extract created content object ID from transaction effects
      const createdObjects = txResponse.effects?.created || [];
      const contentObject = createdObjects.find(
        (obj) =>
          obj.owner && typeof obj.owner === "object" && "Shared" in obj.owner
      );

      if (!contentObject) {
        throw new Error("Failed to find created content object");
      }

      const contentId = contentObject.reference.objectId;

      toast.loading("Registering content metadata...", { id: toastId });

      // Register content with backend
      const registerResponse = await fetch(`${API_URL}/content/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId,
          creator: account.address,
          title: formData.title,
          description: formData.description,
          contentData: formData.content,
          price: priceInMist.toString(),
        }),
      });

      const registerResult = await registerResponse.json();

      if (!registerResult.success) {
        throw new Error(registerResult.error || "Failed to register content");
      }

      toast.success("Content created successfully!", { id: toastId });

      // Reset form
      setFormData({
        title: "",
        description: "",
        content: "",
        price: "",
      });

      // Redirect to access page after a short delay
      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (error) {
      console.error("Create error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create content",
        { id: toastId }
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 to-gray-100">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Create Premium Content
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create and sell your content on the Sui blockchain. All sales are
            atomic and instant.
          </p>
        </div>

        {/* Creation Form */}
        <div className="max-w-2xl mx-auto">
          {!account ? (
            <Card className="p-8 text-center">
              <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">
                Connect Your Wallet
              </h3>
              <p className="text-muted-foreground">
                Please connect your wallet to create content
              </p>
            </Card>
          ) : (
            <Card className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium mb-2"
                  >
                    <FileText className="w-4 h-4 inline mr-2" />
                    Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Enter content title"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isCreating}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium mb-2"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description of your content"
                    rows={3}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isCreating}
                    required
                  />
                </div>

                {/* Content */}
                <div>
                  <label
                    htmlFor="content"
                    className="block text-sm font-medium mb-2"
                  >
                    Premium Content
                  </label>
                  <textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Your premium content that buyers will access after payment"
                    rows={8}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    disabled={isCreating}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This content will only be visible to buyers who own an
                    access receipt
                  </p>
                </div>

                {/* Price */}
                <div>
                  <label
                    htmlFor="price"
                    className="block text-sm font-medium mb-2"
                  >
                    <DollarSign className="w-4 h-4 inline mr-2" />
                    Price (SUI)
                  </label>
                  <input
                    type="number"
                    id="price"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    placeholder="0.5"
                    step="0.01"
                    min="0.01"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isCreating}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set your price in SUI tokens
                  </p>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isCreating}
                  className="w-full"
                  size="lg"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Content...
                    </>
                  ) : (
                    "Create Content"
                  )}
                </Button>
              </form>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
