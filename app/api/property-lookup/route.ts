import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const { address, city, state, zip } = await req.json();

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // RentCast temporarily disabled to avoid overage charges.
    const rentcastApiKey = null;

    const fullAddress = `${address}, ${city || ""}, ${state || ""} ${
      zip || ""
    }`.trim();

    const streetViewImage = googleMapsApiKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=900x500&location=${encodeURIComponent(
          fullAddress
        )}&key=${googleMapsApiKey}`
      : "";

    const { data: savedProperty } = await supabase
      .from("inspections")
      .select("square_feet, year_built, roof_style, property_image")
      .ilike("property_address", `%${address}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (savedProperty?.square_feet) {
      return NextResponse.json({
        source: "database_cache",
        square_feet: savedProperty.square_feet,
        squareFeet: savedProperty.square_feet,
        livingArea: savedProperty.square_feet,
        living_area: savedProperty.square_feet,

        year_built: savedProperty.year_built || "",
        yearBuilt: savedProperty.year_built || "",

        roof_style: savedProperty.roof_style || "",
        roofStyle: savedProperty.roof_style || "",

        property_image: savedProperty.property_image || streetViewImage,
        image: savedProperty.property_image || streetViewImage,
        photo: savedProperty.property_image || streetViewImage,

        address,
        city,
        state,
        zip,
      });
    }

    if (!rentcastApiKey) {
      return NextResponse.json({
        source: "google_only_rentcast_disabled",
        square_feet: "",
        squareFeet: "",
        livingArea: "",
        living_area: "",

        year_built: "",
        yearBuilt: "",

        roof_style: "",
        roofStyle: "",

        property_image: streetViewImage,
        image: streetViewImage,
        photo: streetViewImage,

        address,
        city,
        state,
        zip,
      });
    }

    return NextResponse.json({
      source: "google_only",
      square_feet: "",
      squareFeet: "",
      livingArea: "",
      living_area: "",

      year_built: "",
      yearBuilt: "",

      roof_style: "",
      roofStyle: "",

      property_image: streetViewImage,
      image: streetViewImage,
      photo: streetViewImage,

      address,
      city,
      state,
      zip,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to look up property" },
      { status: 500 }
    );
  }
}