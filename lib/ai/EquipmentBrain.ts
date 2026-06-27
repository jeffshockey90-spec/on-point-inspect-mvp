import { confidenceEngine } from "./ConfidenceEngine";
import { learningEngine } from "./LearningEngine";

export type EquipmentAnalysisInput = {
  manufacturer?: string;
  model?: string;
  serial?: string;
  equipmentType?: string;
  manufactureYear?: number | null;
  confidence?: number;
  photos?: number;
};

export class EquipmentBrain {
  evaluate(input: EquipmentAnalysisInput) {
    const evidence:string[]=[];
    let detected=0;

    if(input.manufacturer){detected++; evidence.push("Manufacturer identified.");}
    if(input.model){detected++; evidence.push("Model identified.");}
    if(input.serial){detected++; evidence.push("Serial identified.");}
    if(input.equipmentType){detected++; evidence.push("Equipment type identified.");}
    if(input.manufactureYear){detected++; evidence.push("Manufacture year decoded.");}

    const conf=confidenceEngine.calculate({
      detectedFields:detected,
      expectedFields:5,
      imageCount:input.photos??1,
      ocrQuality:(input.photos??1)>1?"Excellent":"Good"
    });

    return {
      manufacturer:input.manufacturer,
      model:input.model,
      serial:input.serial,
      equipmentType:input.equipmentType,
      manufactureYear:input.manufactureYear,
      confidence:conf,
      reviewRequired:conf.reviewRequired,
      evidence:[...evidence,...conf.evidence]
    };
  }

  async recordCorrection(args:{
    inspectionId?:number|string;
    ai:any;
    inspector:any;
    confidence?:number;
  }){
    return learningEngine.record({
      inspectionId:args.inspectionId,
      tool:"equipment",
      aiPrediction:args.ai,
      inspectorResult:args.inspector,
      confidence:args.confidence,
      accepted:false
    });
  }
}

export const equipmentBrain=new EquipmentBrain();
