import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { address, city, state, zip } = await req.json();

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const apiKey = process.env.RENTCAST_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing RENTCAST_API_KEY" },
        { status: 500 }
      );
    }

    const fullAddress = `${address}, ${city || ""}, ${state || ""} ${zip || ""}`;

    const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(
      fullAddress
    )}`;

    const rentcastRes = await fetch(url, {
      headers: {
        accept: "application/json",
        "X-Api-Key": apiKey,
      },
    });

    const data = await rentcastRes.json();

    if (!rentcastRes.ok) {
      return NextResponse.json(
        {
          error: "RentCast lookup failed",
          details: data,
        },
        { status: rentcastRes.status }
      );
    }

    const property = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      square_feet: property?.squareFootage || "",
      squareFeet: property?.squareFootage || "",
      livingArea: property?.squareFootage || "",
      year_built: property?.yearBuilt || "",
      bedrooms: property?.bedrooms || "",
      bathrooms: property?.bathrooms || "",
      property_type: property?.propertyType || "",
      lot_size: property?.lotSize || "",
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