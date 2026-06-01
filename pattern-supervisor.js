import { createAgent, HumanMessage, tool } from "langchain";
import { z } from "zod";
import model from "./models.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN 1 — SUPERVISOR
// Un agente Supervisor legge la domanda e sceglie l'agente specializzato corretto.
// z.enum() garantisce che la scelta sia sempre uno dei valori previsti.
// ═══════════════════════════════════════════════════════════════════════════════


const getMeteoTool = tool(
    (input) => Promise.resolve(`Meteo per ${input.città}: soleggiato, 22°C`),
    {
        name: "get_meteo",
        description: "Restituisce le condizioni meteo attuali per una città.",
        schema: z.object({
            città: z.string().describe("Nome della città"),
        }),
    }
);

const agenteMeteo = createAgent({
    model,
    systemPrompt: "Sei un assistente meteo. Usa il tool per rispondere. Rispondi in italiano.",
    tools: [getMeteoTool],
});

const agenteGenerale = createAgent({
    model,
    systemPrompt: "Sei un assistente generico. Rispondi in italiano.",
    tools: [],
});

const supervisore = createAgent({
    model,
    systemPrompt: "Leggi la domanda e decidi se riguarda il meteo oppure è una domanda generica.",
    tools: [],
    responseFormat: z.object({
        agente: z.enum(["meteo", "generale"]).describe("L'agente da usare per rispondere"),
    }),
});

function patternSupervisor(domanda) {
    console.log("\n=== Pattern 1: Supervisor ===");
    return supervisore.invoke({ messages: [new HumanMessage(domanda)] })
        .then(risposta => {
            const scelta = risposta.structuredResponse.agente;
            // scelta è garantito essere "meteo" o "generale" grazie a z.enum()
            const agente = scelta === "meteo" ? agenteMeteo : agenteGenerale;
            console.log(`[Supervisor] domanda: "${domanda}" → agente: ${scelta}`);
            return agente.invoke({ messages: [new HumanMessage(domanda)] });
        })
        .then(risposta => console.log("Risposta:", risposta.messages.at(-1).content))
        .catch(err => console.error("Errore supervisor:", err));
}

patternSupervisor("Che tempo fa a Milano?");
patternSupervisor("Quante ore ha un giorno?");