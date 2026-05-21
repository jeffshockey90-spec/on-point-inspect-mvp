import Nav from "../../components/Nav";
import { Card } from "../../components/Card";

const templates = [
  {
    title: "Missing GFCI Protection",
    observation: "One or more receptacles appeared to lack GFCI protection at the time of inspection.",
    implication: "This may increase the risk of electrical shock in areas where moisture may be present.",
    recommendation: "Recommend evaluation and correction by a qualified electrician as needed."
  },
  {
    title: "Older Home Materials Disclaimer",
    observation: "The home was built during a time when materials such as lead-based paint and asbestos-containing materials may have been commonly used.",
    implication: "The presence of these materials cannot be confirmed without laboratory testing.",
    recommendation: "Recommend further evaluation/testing by a qualified specialist if confirmation is desired."
  },
  {
    title: "Snow / Limited Visibility",
    observation: "Snow cover limited visibility of some exterior and/or roof components at the time of inspection.",
    implication: "Some defects may not be visible when components are concealed.",
    recommendation: "Recommend further evaluation when conditions allow if concerns are present."
  }
];

export default function TemplatesPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-3xl font-bold">Template Library</h1>
        {templates.map((template) => (
          <Card key={template.title} title={template.title}>
            <p><strong>Observation:</strong> {template.observation}</p>
            <p><strong>Implication:</strong> {template.implication}</p>
            <p><strong>Recommendation:</strong> {template.recommendation}</p>
          </Card>
        ))}
      </main>
    </>
  );
}
