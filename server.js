import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());

// 👉 Increased allocation boundaries to safely accept processed vision strings
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Initialize the Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the exact JSON schema we want Gemini to return to ensure the frontend doesn't break
const diagnosticSchema = {
    type: Type.OBJECT,
    properties: {
        totalFatigueHours: { type: Type.INTEGER },
        historyInterpretation: { type: Type.STRING },
        components: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    healthPercent: { type: Type.INTEGER },
                    context: { type: Type.STRING }
                },
                required: ["name", "healthPercent", "context"]
            }
        },
        materials: {
            type: Type.OBJECT,
            properties: {
                recyclableScrap: { type: Type.ARRAY, items: { type: Type.STRING } },
                reusableModules: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["recyclableScrap", "reusableModules"]
        },
        estimatedMarketValue: {
            type: Type.OBJECT,
            properties: {
                currency: { type: Type.STRING },
                lowPrice: { type: Type.NUMBER },
                highPrice: { type: Type.NUMBER },
                justification: { type: Type.STRING }
            },
            required: ["currency", "lowPrice", "highPrice", "justification"]
        }
    },
    required: ["totalFatigueHours", "historyInterpretation", "components", "materials", "estimatedMarketValue"]
};

// POST Endpoint to handle diagnostics mapping
// POST Endpoint to handle diagnostics mapping
app.post('/api/diagnose', async (req, res) => {
    try {
        const { company, appliance, model, year, currentUsage, history, hardwareImage } = req.body;

        // Validation safety guard
        if (!company || !appliance || !year || !currentUsage) {
            return res.status(400).json({ error: "Missing required diagnostic metrics." });
        }

        const userPrompt = `
            Analyze this appliance for e-waste evaluation, structural material breakdown, and second-hand market pricing:
            - Manufacturer/Company: ${company}
            - Appliance Type: ${appliance}
            - Model Details: ${model || 'Unknown'}
            - Year Bought/Installed: ${year}
            - Average Daily Usage Hours: ${currentUsage} hours/day
            - Operational Repair History & Environment: ${history || 'No custom history provided.'}
            
            Note: The current year is 2026. Calculate total fatigue hours using (2026 - Year Bought) * 365 * Daily Usage as a baseline, but adapt health percentages dynamically based on the damage descriptions provided in the history.
        `;

        // 👉 FIX: The @google/genai SDK expects parts or prompts flat in contents when mixing types
        const contents = [];

        if (hardwareImage && typeof hardwareImage === 'string' && hardwareImage.includes('base64,')) {
            const base64Data = hardwareImage.split('base64,')[1];
            const mimeType = hardwareImage.split(';')[0].split(':')[1] || 'image/jpeg';

            contents.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
        }

        // Push the text prompt into the contents array
        contents.push(userPrompt);

        // Request the structured response from gemini-2.5-flash
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents, // 👉 Pass the clean, unnested array directly
            config: {
                systemInstruction: "You are an expert Smart E-Waste Management analyzer. Calculate internal component wear, map valuable reusable components vs pure raw scrap materials, and generate realistic third-party marketplace valuation ranges based on condition metrics.",
                responseMimeType: "application/json",
                responseSchema: diagnosticSchema,
                temperature: 0.2 
            }
        });

        // Parse and send the clean JSON payload back to the client
        const resultJson = JSON.parse(response.text);
        res.json(resultJson);

    } catch (error) {
        console.error("Gemini Backend Processing Error:", error);
        res.status(500).json({ error: "Internal AI processing failed." });
    }
});

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: "You are an expert Smart E-Waste Management analyzer. Calculate internal component wear, map valuable reusable components vs pure raw scrap materials, and generate realistic third-party marketplace valuation ranges based on condition metrics.",
                responseMimeType: "application/json",
                responseSchema: diagnosticSchema,
                temperature: 0.2
            }
        });

        const resultJson = JSON.parse(response.text);
        res.json(resultJson);

    } catch (error) {
        console.error("Gemini Backend Processing Error:", error);
        res.status(500).json({ error: "Internal AI processing failed." });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, hardwareImage } = req.body;
        
        // 👉 FIX: For the chat route, use the standard flat format expected by contents
        const contents = [];

        if (hardwareImage && typeof hardwareImage === 'string' && hardwareImage.includes('base64,')) {
            const base64Data = hardwareImage.split('base64,')[1];
            const mimeType = hardwareImage.split(';')[0].split(':')[1] || 'image/jpeg';

            contents.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
        }

        const finalPrompt = (typeof message === 'string' && message.trim()) || "Please inspect this attached electronic appliance component snapshot, help clarify what device features it contains, and suggest options for recycling or secondary market trade.";
        contents.push(finalPrompt);

        // Request conversational stream response from gemini-2.5-flash
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents, // Passed cleanly here
            config: {
                systemInstruction: "You are an intelligent Smart E-Waste Recycling system expert assistant with computer vision capabilities. Deeply analyze visual structures if an image is provided. If an image is present, identify visible hardware damages, model types, or degradation signs. Otherwise, act as a query answering assistant. Keep answers helpful, analytical, and clear.",
                temperature: 0.4
            }
        });

        res.json({ reply: response.text });

    } catch (error) {
        console.error("Chat backend failure route:", error);
        res.status(500).json({ error: "The chat service dropped your computational prompt processing." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Smart E-Waste Server active on port ${PORT}`));
