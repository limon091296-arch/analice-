import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // AI Analysis Endpoint
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image, prompt } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const model = "gemini-3-flash-preview";
      
      const parts = [
        { inlineData: { mimeType: "image/jpeg", data: image.split(',')[1] } },
        { text: prompt || "Analyze this candlestick chart. Provide a verdict (UP, DOWN, or NEUTRAL), the reason, and a confidence score between 70% and 98%. Format the output as JSON: { \"verdict\": \"UP\", \"reason\": \"Explanation\", \"confidence\": 85 }" }
      ];

      const response = await ai.models.generateContent({
        model,
        contents: { parts }
      });

      const text = response.text || "{}";
      // Try to extract JSON if the model returns it inside markdown blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let result;
      try {
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: "NEUTRAL", reason: "Model returned non-JSON response: " + text, confidence: 0 };
      } catch (e) {
        result = { verdict: "NEUTRAL", reason: "Failed to parse JSON: " + text, confidence: 0 };
      }
      
      // Ensure result has required fields and normalize verdict for Firestore rules
      result.reason = result.reason || "No reason provided.";
      result.confidence = typeof result.confidence === 'number' ? Math.min(Math.max(result.confidence, 0), 100) : 0;

      if (typeof result.verdict === 'string') {
        const v = result.verdict.toUpperCase();
        if (v.includes("UP") || v.includes("CALL")) result.verdict = "UP";
        else if (v.includes("DOWN") || v.includes("PUT")) result.verdict = "DOWN";
        else result.verdict = "NEUTRAL";
      } else {
        result.verdict = "NEUTRAL";
      }

      res.json(result);
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze chart" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
