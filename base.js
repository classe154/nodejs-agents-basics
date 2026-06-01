import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent, HumanMessage, tool } from "langchain";
import { z } from "zod";

// ─── Configurazione del modello ──────────────────────────────────────────────
// Un'unica istanza riutilizzata in tutti gli esempi

const model = new ChatAnthropic({
    model: "claude-haiku-4-5",
    apiKey: process.env.CLAUDE_API_KEY,
});


// ─── Esempio 1: Chiamata diretta al modello ──────────────────────────────────
// model.invoke() accetta un array di messaggi e restituisce una Promise.
// La risposta è un oggetto: il testo generato si trova in .content

console.log("\n=== Esempio 1: Chiamata diretta ===");

model.invoke([new HumanMessage("Ciao! Chi sei? Rispondi in una frase sola.")])
    .then(risposta => console.log(risposta.content))
    .catch(err => console.error("Errore esempio 1:", err));


// ─── Esempio 2: Limiti del modello ──────────────────────────────────────────
// Il modello non ha accesso a dati in tempo reale.
// Chiedendogli il meteo odierno, risponderà che non lo sa oppure inventerà.

console.log("\n=== Esempio 2: Limiti del modello ===");

model.invoke([new HumanMessage("Che tempo fa a Milano oggi? Dammi la temperatura esatta.")])
    .then(risposta => console.log(risposta.content))
    .catch(err => console.error("Errore esempio 2:", err));


// ─── Esempio 3: Definizione e uso diretto di un tool ─────────────────────────
// Un tool è una funzione JavaScript con metadati (name, description, schema).
// Il modello usa quei metadati per decidere autonomamente quando invocarla.
// La funzione deve restituire sempre una stringa (vincolo Anthropic).
// Lo schema radice deve essere z.object() — z.array() non è supportato.

console.log("\n=== Esempio 3: Tool invocato direttamente ===");

const getMeteo = tool(
    (input) => Promise.resolve(`Meteo per ${input.città}: soleggiato, 22°C`),
    {
        name: "get_meteo",
        description: "Restituisce le condizioni meteo attuali per una città.",
        schema: z.object({
            città: z.string().describe("Nome della città"),
        }),
    }
);

// Proviamo a chiamare il tool direttamente, senza passare per il modello
getMeteo.invoke({ città: "Roma" })
    .then(risultato => console.log("Risultato tool:", risultato))
    .catch(err => console.error("Errore esempio 3:", err));


// ─── Esempio 4: Agente con tool ──────────────────────────────────────────────
// createAgent gestisce in autonomia il ciclo:
//   messaggio utente → il modello decide se usare un tool → tool eseguito
//   → risultato tornato al modello → risposta finale
// L'ultima risposta si legge con .messages.at(-1).content

console.log("\n=== Esempio 4: Agente con tool ===");

const agente = createAgent({
    model,
    systemPrompt: "Sei un assistente meteo. Usa il tool get_meteo per rispondere.",
    tools: [getMeteo],
});

agente.invoke({ messages: [new HumanMessage("Che tempo fa a Roma?")] })
    .then(risposta => console.log(risposta.messages.at(-1).content))
    .catch(err => console.error("Errore esempio 4:", err));
