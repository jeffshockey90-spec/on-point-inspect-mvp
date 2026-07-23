"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google: any;
  }
}

export type ParsedAddress = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

// Wires a Google Places Autocomplete widget onto an input ref: loads the
// Places script (once per page, shared across every hook instance), and
// calls back with a parsed street address/city/state/zip whenever the
// inspector selects a suggestion. Callers own what happens with the parsed
// address (e.g. triggering a property-data lookup) - this hook only handles
// the Places wiring itself.
export function useAddressAutocomplete(
  onPlaceSelected: (parsed: ParsedAddress) => void,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const callbackRef = useRef(onPlaceSelected);
  callbackRef.current = onPlaceSelected;

  useEffect(() => {
    function setupAutocomplete() {
      if (!inputRef.current || !window.google?.maps?.places) return;

      const autocomplete = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ["address"],
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address"],
        },
      );

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        let streetNumber = "";
        let route = "";
        let locality = "";
        let adminArea = "";
        let postalCode = "";

        place.address_components.forEach((component: any) => {
          const types = component.types;

          if (types.includes("street_number")) streetNumber = component.long_name;
          if (types.includes("route")) route = component.long_name;
          if (types.includes("locality")) locality = component.long_name;
          if (types.includes("administrative_area_level_1"))
            adminArea = component.short_name;
          if (types.includes("postal_code")) postalCode = component.long_name;
        });

        const streetAddress = `${streetNumber} ${route}`.trim();
        const finalAddress = streetAddress || place.formatted_address || "";

        callbackRef.current({
          address: finalAddress,
          city: locality,
          state: adminArea || "MD",
          zip: postalCode,
        });
      });
    }

    if (window.google?.maps?.places) {
      setupAutocomplete();
      return;
    }

    const existingScript = document.getElementById(
      "google-places-script",
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", setupAutocomplete);
      return () => existingScript.removeEventListener("load", setupAutocomplete);
    }

    const script = document.createElement("script");

    script.id = "google-places-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = setupAutocomplete;

    document.body.appendChild(script);
  }, []);

  return inputRef;
}
