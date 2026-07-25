"use client";

import { useState } from "react";
import { useAddressAutocomplete } from "../hooks/useAddressAutocomplete";

export default function OfficeAddressField({ defaultValue }: { defaultValue: string }) {
  const [address, setAddress] = useState(defaultValue);

  const addressInputRef = useAddressAutocomplete((parsed) => {
    const fullAddress = [parsed.address, parsed.city, parsed.state, parsed.zip]
      .filter(Boolean)
      .join(", ");

    setAddress(fullAddress || parsed.address);
  });

  return (
    <input
      ref={addressInputRef}
      type="text"
      name="office_address"
      value={address}
      onChange={(e) => setAddress(e.target.value)}
      placeholder="Where you drive from before each inspection"
      className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
    />
  );
}
