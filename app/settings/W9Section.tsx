"use client";

import { useState } from "react";
import CompanyDocumentUploader from "./CompanyDocumentUploader";
import W9FillModal from "./W9FillModal";

export default function W9Section({
  companyId,
  initialPath,
  initialUploadedAt,
}: {
  companyId: string;
  initialPath: string;
  initialUploadedAt: string | null;
}) {
  const [path, setPath] = useState(initialPath);
  const [uploadedAt, setUploadedAt] = useState(initialUploadedAt);

  return (
    <div className="min-w-0 space-y-3 md:col-span-2">
      <CompanyDocumentUploader
        key={path || "empty"}
        name="w9_document_url"
        label="W9 Form"
        helper="Upload your completed, signed W9 (PDF), or fill it out below. Kept privately - send it from any report's toolbar when a realtor or client requests one."
        companyId={companyId}
        initialPath={path}
        initialUploadedAt={uploadedAt}
        folder="documents"
        buttonText="Upload W9"
      />

      <W9FillModal
        onSaved={(result) => {
          setPath(result.path);
          setUploadedAt(result.uploadedAt);
        }}
      />
    </div>
  );
}
