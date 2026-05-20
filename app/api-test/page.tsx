"use client";

export default function ApiTestPage() {
  async function testSuggest() {
    const response = await fetch("/api/property-suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: "16717 Tammany" }),
    });

    const data = await response.json();

    alert(JSON.stringify(data, null, 2));
  }

  return (
    <main className="min-h-screen bg-black p-10 text-white">
      <button
        onClick={testSuggest}
        className="rounded bg-teal-500 px-6 py-3 font-bold text-black"
      >
        Test Property Suggest
      </button>
    </main>
  );
}