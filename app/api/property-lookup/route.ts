import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { address, city, state, zip } = await req.json();

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const rentcastApiKey = process.env.RENTCAST_API_KEY;
    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!rentcastApiKey) {
      return NextResponse.json(
        { error: "Missing RENTCAST_API_KEY" },
        { status: 500 }
      );
    }

    const fullAddress = `${address}, ${city || ""}, ${state || ""} ${
      zip || ""
    }`;

    const rentcastUrl = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(
      fullAddress
    )}`;

    const rentcastRes = await fetch(rentcastUrl, {
      headers: {
        accept: "application/json",
        "X-Api-Key": rentcastApiKey,
      },
    });

    const rentcastData = await rentcastRes.json();

    if (!rentcastRes.ok) {
      return NextResponse.json(
        {
          error: "RentCast lookup failed",
          details: rentcastData,
        },
        { status: rentcastRes.status }
      );
    }

    const property = Array.isArray(rentcastData)
      ? rentcastData[0]
      : rentcastData;

    const streetViewImage = googleMapsApiKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=900x500&location=${encodeURIComponent(
          fullAddress
        )}&key=${googleMapsApiKey}`
      : "";

    return NextResponse.json({
      square_feet: property?.squareFootage || "",
      squareFeet: property?.squareFootage || "",
      livingArea: property?.squareFootage || "",
      year_built: property?.yearBuilt || "",
      yearBuilt: property?.yearBuilt || "",
      bedrooms: property?.bedrooms || "",
      bathrooms: property?.bathrooms || "",
      property_type: property?.propertyType || "",
      lot_size: property?.lotSize || "",
      roof_style: property?.roofType || property?.roofStyle || "",
      roofStyle: property?.roofType || property?.roofStyle || "",
      style: property?.propertyType || "",
      propertyStyle: property?.propertyType || "",
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