"use client";

import { useState } from "react";
import SettingsToggle from "../../components/SettingsToggle";

const ON_POINT_DEFAULT_STANDARDS = "STANDARDS OF PRACTICE\nInspection Details\nExterior\nI. The inspector shall: A. inspect: 1. wall coverings, flashing, and trim. 2. exterior doors. 3. attached and adjacent decks,\nbalconies, stoops, steps, porches, and their associated railings. 4. eaves, soffits, and fascias where accessible from the\nground level. 5. vegetation, grading, surface drainage, and retaining walls that are likely to adversely affect the building. 6.\nadjacent and entryway walkways, patios, and driveways. B. describe wall coverings.\nII. The inspector is NOT required to inspect: A. screening, shutters, awnings, and similar seasonal accessories. B. fences,\nboundary walls, and similar structures. C. geological and soil conditions. D. recreational facilities. E. outbuildings other than\ngarages and carports. F. seawalls, break-walls, and docks. G. erosion control and earth stabilization measures.\nRoof\nI. The inspector shall inspect from ground level or the eaves: A. the roof-covering materials; B. the gutters; C. the\ndownspouts; D. the vents, flashing, skylights, chimney, and other roof penetrations; and E. the general structure of the roof\nfrom the readily accessible panels, doors or stairs.\nII. The inspector shall describe: A. the type of roof-covering materials.\nIII. The inspector shall report as in need of correction: A. observed indications of active roof leaks.\nIV. The inspector is not required to: A. walk on any roof surface. B. predict the service life expectancy. C. inspect\nunderground downspout diverter drainage pipes. D. remove snow, ice, debris or other conditions that prohibit the\nobservation of the roof surfaces. E. move insulation. F. inspect antennae, satellite dishes, lightning arresters, de-icing\nequipment, or similar attachments. G. walk on any roof areas that appear, in the inspectors opinion, to be unsafe. H. walk\non any roof areas if doing so might, in the inspector's opinion, cause damage. I. perform a water test. J. warrant or certify\nthe roof. K. confirm proper fastening or installation of any roof-covering material.\nBasement, Foundation, Crawlspace & Structure\nI. The inspector shall inspect: A. the foundation; B. the basement; C. the crawlspace; and D. structural components.\nII. The inspector shall describe: A. the type of foundation; and B. the location of the access to the under-floor space.\nIII. The inspector shall report as in need of correction: A. observed indications of wood in contact with or near soil; B.\nobserved indications of active water penetration; C. observed indications of possible foundation movement, such as\nsheetrock cracks, brick cracks, out-of-square door frames, and unlevel floors; and D. any observed cutting, notching and\nboring of framing members that may, in the inspector's opinion, present a structural or safety concern.\nIV. The inspector is not required to: A. enter any crawlspace that is not readily accessible, or where entry could cause\ndamage or pose a hazard to him/herself. B. move stored items or debris. C. operate sump pumps with inaccessible floats.\nD. identify the size, spacing, span or location or determine the adequacy of foundation bolting, bracing, joists, joist spans\nor support systems. E. provide any engineering or architectural service. F. report on the adequacy of any structural system\nor component.\nHeating\nI. The inspector shall inspect: A. the heating system, using normal operating controls.\nII. The inspector shall describe: A. the location of the thermostat for the heating system; B. the energy source; and C. the\nheating method.\nIII. The inspector shall report as in need of correction: A. any heating system that did not operate; and B. if the heating\nsystem was deemed inaccessible.\nIV. The inspector is not required to: A. inspect or evaluate the interior of flues or chimneys, fire chambers, heat exchangers,\ncombustion air systems, fresh-air intakes, humidifiers, dehumidifiers, electronic air filters, geothermal systems, or solar\nheating systems. B. inspect fuel tanks or underground or concealed fuel supply systems. C. determine the uniformity,\ntemperature, flow, balance, distribution, size, capacity, BTU, or supply adequacy of the heating system. D. light or ignite\npilot flames. E. activate heating, heat pump systems, or other heating systems when ambient temperatures or other\ncircumstances are not conducive to safe operation or may damage the equipment. F. override electronic thermostats. G.\nevaluate fuel quality. H. verify thermostat calibration, heat anticipation, or automatic setbacks, timers, programs or clocks.\nCooling\nI. The inspector shall inspect: A. the cooling system, using normal operating controls.\nII. The inspector shall describe: A. the location of the thermostat for the cooling system; and B. the cooling method.\nIII. The inspector shall report as in need of correction: A. any cooling system that did not operate; and B. if the cooling\nsystem was deemed inaccessible.\nIV. The inspector is not required to: A. determine the uniformity, temperature, flow, balance, distribution, size, capacity,\nBTU, or supply adequacy of the cooling system. B. inspect portable window units, through-wall units, or electronic air\nfilters. C. operate equipment or systems if the exterior temperature is below 65 Fahrenheit, or when other circumstances\nare not conducive to safe operation or may damage the equipment. D. inspect or determine thermostat calibration,\ncooling anticipation, or automatic setbacks or clocks. E. examine electrical current, coolant fluids or gases, or coolant\nleakage.\nPlumbing\nI. The inspector shall inspect: A. the main water supply shut-off valve; B. the main fuel supply shut-off valve; C. the water\nheating equipment, including the energy source, venting connections, temperature/pressure-relief (TPR) valves, Watts 210\nvalves, and seismic bracing; D. interior water supply, including all fixtures and faucets, by running the water; E. all toilets for\nproper operation by flushing; F. all sinks, tubs and showers for functional drainage; G. the drain, waste and vent system;\nand H. drainage sump pumps with accessible floats.\nII. The inspector shall describe: A. whether the water supply is public or private based upon observed evidence; B. the\nlocation of the main water supply shut-off valve; C. the location of the main fuel supply shut-off valve; D. the location of any\nobserved fuel-storage system; and E. the capacity of the water heating equipment, if labeled.\nIII. The inspector shall report as in need of correction: A. deficiencies in the water supply by viewing the functional flow in\ntwo fixtures operated simultaneously; B. deficiencies in the installation of hot and cold water faucets; C. mechanical drain\nstops that were missing or did not operate if installed in sinks, lavatories and tubs; and D. toilets that were damaged, had\nloose connections to the floor, were leaking, or had tank components that did not operate.\nIV. The inspector is not required to: A. light or ignite pilot flames. B. measure the capacity, temperature, age, life\nexpectancy or adequacy of the water heater. C. inspect the interior of flues or chimneys, combustion air systems, water\nsoftener or filtering systems, well pumps or tanks, safety or shut-off valves, floor drains, lawn sprinkler systems, or fire\nsprinkler systems. D. determine the exact flow rate, volume, pressure, temperature or adequacy of the water supply. E.\ndetermine the water quality, potability or reliability of the water supply or source. F. open sealed plumbing access panels.\nG. inspect clothes washing machines or their connections. H. operate any valve. I. test shower pans, tub and shower\nsurrounds or enclosures for leakage or functional overflow protection. J. evaluate the compliance with conservation,\nenergy or building standards, or the proper design or sizing of any water, waste or venting components, fixtures or piping.\nK. determine the effectiveness of anti-siphon, backflow prevention or drain-stop devices. L. determine whether there are\nsufficient cleanouts for effective cleaning of drains. M. evaluate fuel storage tanks or supply systems. N. inspect\nwastewater treatment systems. O. inspect water treatment systems or water filters. P. inspect water storage tanks,\npressure pumps, or bladder tanks. Q. evaluate wait time to obtain hot water at fixtures, or perform testing of any kind to\nwater heater elements. R. evaluate or determine the adequacy of combustion air. S. test, operate, open or close: safety\ncontrols, manual stop valves, temperature/pressure-relief valves, control valves, or check valves. T. examine ancillary or\nauxiliary systems or components, such as, but not limited to, those related to solar water heating and hot water circulation.\nU. determine the existence or condition of polybutylene plumbing. V. inspect or test for gas or fuel leaks, or indications\nthereof.\nElectrical\nI. The inspector shall inspect: A. the service drop; B. the overhead service conductors and attachment point; C. the service\nhead, gooseneck and drip loops; D. the service mast, service conduit and raceway; E. the electric meter and base; F.\nservice-entrance conductors; G. the main service disconnect; H. panelboards and over-current protection devices (circuit\nbreakers and fuses); I. service grounding and bonding; J. a representative number of switches, lighting fixtures and\nreceptacles, including receptacles observed and deemed to be arc-fault circuit interrupter (AFCI)-protected using the AFCI\ntest button, where possible; K. all ground-fault circuit interrupter receptacles and circuit breakers observed and deemed to\nbe GFCIs using a GFCI tester, where possible; and L. smoke and carbon-monoxide detectors.\nII. The inspector shall describe: A. the main service disconnect's amperage rating, if labeled; and B. the type of wiring\nobserved.\nIII. The inspector shall report as in need of correction: A. deficiencies in the integrity of the service entrance conductors\ninsulation, drip loop, and vertical clearances from grade and roofs; B. any unused circuit-breaker panel opening that was\nnot filled; C. the presence of solid conductor aluminum branch-circuit wiring, if readily visible; D. any tested receptacle in\nwhich power was not present, polarity was incorrect, the cover was not in place, the GFCI devices were not properly\ninstalled or did not operate properly, evidence of arcing or excessive heat, and where the receptacle was not grounded or\nwas not secured to the wall; and E. the absence of smoke detectors.\nIV. The inspector is not required to: A. insert any tool, probe or device into the main panelboard, sub-panels, distribution\npanelboards, or electrical fixtures. B. operate electrical systems that are shut down. C. remove panelboard cabinet covers\nor dead fronts. D. operate or re-set over-current protection devices or overload devices. E. operate or test smoke or\ncarbon-monoxide detectors or alarms F. inspect, operate or test any security, fire or alarms systems or components, or\nother warning or signaling systems. G. measure or determine the amperage or voltage of the main service equipment, if\nnot visibly labeled. H. inspect ancillary wiring or remote-control devices. I. activate any electrical systems or branch circuits\nthat are not energized. J. inspect low-voltage systems, electrical de-icing tapes, swimming pool wiring, or any\ntimecontrolled devices. K. verify the service ground. L. inspect private or emergency electrical supply sources, including,\nbut not limited to: generators, windmills, photovoltaic solar collectors, or battery or electrical storage facility. M. inspect\nspark or lightning arrestors. N. inspect or test de-icing equipment. O. conduct voltage-drop calculations. P. determine the\naccuracy of labeling. Q. inspect exterior lighting.\nAttic, Insulation & Ventilation\nI. The inspector shall inspect: A. insulation in unfinished spaces, including attics, crawlspaces and foundation areas; B.\nventilation of unfinished spaces, including attics, crawlspaces and foundation areas; and C. mechanical exhaust systems in\nthe kitchen, bathrooms and laundry area.\nII. The inspector shall describe: A. the type of insulation observed; and B. the approximate average depth of insulation\nobserved at the unfinished attic floor area or roof structure.\nIII. The inspector shall report as in need of correction: A. the general absence of insulation or ventilation in unfinished\nspaces.\nIV. The inspector is not required to: A. enter the attic or any unfinished spaces that are not readily accessible, or where\nentry could cause damage or, in the inspector's opinion, pose a safety hazard. B. move, touch or disturb insulation. C.\nmove, touch or disturb vapor retarders. D. break or otherwise damage the surface finish or weather seal on or around\naccess panels or covers. E. identify the composition or R-value of insulation material. F. activate thermostatically operated\nfans. G. determine the types of materials used in insulation or wrapping of pipes, ducts, jackets, boilers or wiring. H.\ndetermine the adequacy of ventilation.\nDoors, Windows & Interior\nI. The inspector shall inspect: A. a representative number of doors and windows by opening and closing them; B. floors,\nwalls and ceilings; C. stairs, steps, landings, stairways and ramps; D. railings, guards and handrails; and E. garage vehicle\ndoors and the operation of garage vehicle door openers, using normal operating controls.\nII. The inspector shall describe: A. a garage vehicle door as manually-operated or installed with a garage door opener.\nIII. The inspector shall report as in need of correction: A. improper spacing between intermediate balusters, spindles and\nrails for steps, stairways, guards and railings; B. photo-electric safety sensors that did not operate properly; and C. any\nwindow that was obviously fogged or displayed other evidence of broken seals.\nIV. The inspector is not required to: A. inspect paint, wallpaper, window treatments or finish treatments. B. inspect floor\ncoverings or carpeting. C. inspect central vacuum systems. D. inspect for safety glazing. E. inspect security systems or\ncomponents. F. evaluate the fastening of islands, countertops, cabinets, sink tops or fixtures. G. move furniture, stored\nitems, or any coverings, such as carpets or rugs, in order to inspect the concealed floor structure. H. move suspendedceiling tiles. I. inspect or move any household appliances. J. inspect or operate equipment housed in the garage, except as\notherwise noted. K. verify or certify the proper operation of any pressure-activated auto-reverse or related safety feature\nof a garage door. L. operate or evaluate any security bar release and opening mechanisms, whether interior or exterior,\nincluding their compliance with local, state or federal standards. M. operate any system, appliance or component that\nrequires the use of special keys, codes, combinations or devices. N. operate or evaluate self-cleaning oven cycles, tilt\nguards/latches, or signal lights. O. inspect microwave ovens or test leakage from microwave ovens. P. operate or examine\nany sauna, steamgenerating equipment, kiln, toaster, ice maker, coffee maker, can opener, bread warmer, blender, instant\nhot-water dispenser, or other small, ancillary appliances or devices. Q. inspect elevators. R. inspect remote controls. S.\ninspect appliances. T. inspect items not permanently installed. U. discover firewall compromises. V. inspect pools, spas or\nfountains. W. determine the adequacy of whirlpool or spa jets, water force, or bubble effects. X. determine the structural\nintegrity or leakage of pools or spas.";

type StandardsOfPracticeEditorProps = {
  initialTitle: string;
  initialBody: string;
  initialIncludeShare: boolean;
  initialIncludePdf: boolean;
};

export default function StandardsOfPracticeEditor({
  initialTitle,
  initialBody,
  initialIncludeShare,
  initialIncludePdf,
}: StandardsOfPracticeEditorProps) {
  const [title, setTitle] = useState(initialTitle || "Standards of Practice");
  const [body, setBody] = useState(initialBody || "");
  const [includeShare, setIncludeShare] = useState(initialIncludeShare);
  const [includePdf, setIncludePdf] = useState(initialIncludePdf);
  const usingDefault = body.trim().length === 0;

  function copyDefaultStandards() {
    setTitle("Standards of Practice");
    setBody(ON_POINT_DEFAULT_STANDARDS);
  }

  function clearCustomStandards() {
    setBody("");
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#10151e] shadow-2xl shadow-black/20">
      <div className="border-b border-[#1a212c]/90 p-5 sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Report Settings
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              Standards of Practice
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
              Paste your own inspection Standards of Practice here. Leave it blank
              to use the FLOW default SOP. These settings are saved to your
              company and are used automatically in shared reports and PDF downloads.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              usingDefault
                ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
                : "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
            }`}
          >
            {usingDefault ? "Using FLOW Default" : "Custom SOP Active"}
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 md:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <label className="block min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              SOP Title
            </p>
            <input
              name="standards_of_practice_title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Standards of Practice"
              className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
            />
          </label>

          <div className="rounded-2xl border border-[#232b38] bg-[#0a0e13] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              Quick Setup
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Start from the FLOW default
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
              Copy Jeff’s default SOP into the editor, then adjust it for your
              own state, association, or company policy.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <button
                type="button"
                onClick={copyDefaultStandards}
                className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-cyan-400 sm:w-auto lg:w-full xl:w-auto"
              >
                Use FLOW Default SOP
              </button>

              <button
                type="button"
                onClick={clearCustomStandards}
                className="w-full rounded-xl border border-[#232b38] px-4 py-3 text-sm font-semibold text-[#e8ecf3] transition active:scale-[0.98] hover:border-cyan-400 hover:text-cyan-300 sm:w-auto lg:w-full xl:w-auto"
              >
                Clear Custom SOP
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#232b38] bg-[#0a0e13] p-4 transition hover:border-cyan-400/70">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-6 text-white">
                  Show in shared report
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8a93a3]">
                  Adds the Standards of Practice tab and section for clients and realtors.
                </p>
              </div>
              <SettingsToggle
                name="standards_include_in_share"
                checked={includeShare}
                onChange={setIncludeShare}
                ariaLabel="Show Standards of Practice in shared report"
                className="mt-0.5"
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#232b38] bg-[#0a0e13] p-4 transition hover:border-cyan-400/70">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-6 text-white">
                  Include in downloaded PDF
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8a93a3]">
                  Adds SOP pages to the downloadable report PDF.
                </p>
              </div>
              <SettingsToggle
                name="standards_include_in_pdf"
                checked={includePdf}
                onChange={setIncludePdf}
                ariaLabel="Include Standards of Practice in downloaded PDF"
                className="mt-0.5"
              />
            </div>
          </div>
        </div>

        <label className="block min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              Custom Standards of Practice
            </p>
            <span className="text-xs font-bold text-[#59626f]">
              {body.trim().length ? `${body.trim().length.toLocaleString()} characters` : "Default fallback"}
            </span>
          </div>
          <textarea
            name="standards_of_practice_body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={22}
            placeholder="Paste your Standards of Practice here. Leave blank to use the FLOW default SOP."
            className="min-h-[420px] w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-4 text-sm leading-6 text-white outline-none focus:border-cyan-400"
          />
          <p className="mt-2 text-xs leading-5 text-[#59626f]">
            Tip: separate major paragraphs with a blank line. The shared report and PDF will format it automatically.
          </p>
        </label>
      </div>
    </section>
  );
}
