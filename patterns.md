# Pattern multi-agente con LangChain.js e Claude

Durata stimata: 1 ora (~20 minuti per pattern).

Questa lezione assume che tu sappia già cos'è un agente e un tool con LangChain
(vedi il `README.md` nella root). Qui esploriamo come far lavorare più agenti insieme.

Per eseguire gli esempi: `node --env-file=.env patterns.js`
Il file `.env` deve contenere `CLAUDE_API_KEY=<tua chiave>` (vedi `.env.example`).

---

## Pattern 1 — Supervisor

**Problema:** hai più agenti specializzati e devi decidere quale usare in base alla
richiesta. La soluzione naive è una serie di `if` o `regex` nel codice: fragile,
non generalizza, richiede aggiornamenti manuali per ogni nuovo caso.

**Soluzione:** un agente Supervisor legge la richiesta e restituisce il nome
dell'agente da usare. `responseFormat` con `z.enum()` vincola la risposta a valori
precisi: il modello non può inventare valori fuori dalla lista.

```mermaid
flowchart TD
    U[Utente] --> S[Supervisore]
    S -->|agente: meteo| AM[Agente Meteo]
    S -->|agente: generale| AG[Agente Generale]
    AM --> R[Risposta]
    AG --> R
```

```js
const supervisore = createAgent({
    model,
    systemPrompt: "Leggi la domanda e decidi se riguarda il meteo oppure è una domanda generica.",
    tools: [],
    responseFormat: z.object({
        agente: z.enum(["meteo", "generale"]).describe("L'agente da usare"),
    }),
});

function chat(domanda) {
    return supervisore.invoke({ messages: [new HumanMessage(domanda)] })
        .then(risposta => {
            const scelta = risposta.structuredResponse.agente;
            const agente = scelta === "meteo" ? agenteMeteo : agenteGenerale;
            console.log(`Supervisor ha scelto: ${scelta}`);
            return agente.invoke({ messages: [new HumanMessage(domanda)] });
        })
        .then(risposta => console.log("Risposta:", risposta.messages.at(-1).content))
        .catch(err => console.error(err));
}

chat("Che tempo fa a Milano?");
chat("Quante ore ha un giorno?");
```

Il Supervisor restituisce un oggetto strutturato tramite `risposta.structuredResponse`.
Il codice JavaScript legge la scelta e chiama l'agente corretto. Il secondo `.then()`
riceve la risposta dell'agente specializzato, non del Supervisor.

**Punto chiave:** il routing è fatto da un LLM, non da regole scritte a mano.
`z.enum()` garantisce che la scelta sia sempre uno dei valori previsti.

---

## Pattern 2 — Parallel

**Problema:** alcune analisi richiedono più prospettive indipendenti. Eseguirle
in sequenza è lento: il tempo totale è la somma di tutti i tempi.

**Soluzione:** più agenti partono contemporaneamente con `Promise.all()`. Quando
tutti hanno finito, un agente aggregatore sintetizza i risultati. Il tempo totale
diventa quello del più lento, non la somma.

```mermaid
flowchart TD
    U[Utente] --> AO[Agente Ottimista]
    U --> AP[Agente Pessimista]
    U --> AN[Agente Neutro]
    AO --> AGG[Aggregatore]
    AP --> AGG
    AN --> AGG
    AGG --> R[Risposta finale]
```

```js
const proposta = "Aprire un negozio di abbigliamento online";
const messaggi = [new HumanMessage(`Analizza questa proposta: "${proposta}"`)];

Promise.all([
    agenteOttimista.invoke({ messages: messaggi }),
    agentePessimista.invoke({ messages: messaggi }),
    agenteNeutro.invoke({ messages: messaggi }),
])
.then(([rispostaOttimista, rispostaPessimista, rispostaNeutro]) => {
    const analisi = {
        ottimista: rispostaOttimista.messages.at(-1).content,
        pessimista: rispostaPessimista.messages.at(-1).content,
        neutro: rispostaNeutro.messages.at(-1).content,
    };
    return agenteAggregatore.invoke({
        messages: [new HumanMessage(`
Ottimista: ${analisi.ottimista}

Pessimista: ${analisi.pessimista}

Neutro: ${analisi.neutro}
        `)]
    });
})
.then(risposta => console.log("Giudizio finale:\n", risposta.messages.at(-1).content))
.catch(err => console.error(err));
```

`Promise.all()` riceve un array di Promise e aspetta che tutte completino.
Il `.then()` riceve un array di risultati nello stesso ordine dell'input:
`[rispostaOttimista, rispostaPessimista, rispostaNeutro]` via destructuring.
L'aggregatore non chiama API aggiuntive: lavora solo sui testi già ricevuti.

**Punto chiave:** con `Promise.all()` il tempo totale è quello del più lento, non
la somma. L'aggregatore è un agente normale: cambia solo il contenuto del suo prompt.

---

## Pattern 3 — Reflection

**Problema:** un singolo agente produce output di qualità variabile. Non c'è modo
di sapere se il risultato è buono senza una valutazione esterna.

**Soluzione:** due agenti con ruoli opposti lavorano in loop. L'Esecutore genera
una bozza; il Critico la valuta e restituisce `approvato: true/false` con feedback.
Se non approvata, la bozza aggiornata torna all'Esecutore. Il loop continua fino
all'approvazione o al raggiungimento di `maxIterazioni`.

```mermaid
flowchart TD
    U[Utente] --> E[Esecutore]
    E -->|bozza| C[Critico]
    C -->|approvato: false + feedback| E
    C -->|approvato: true| R[Risposta finale]
    E -.->|max iterazioni| STOP[Stop forzato]
```

```js
const critico = createAgent({
    model,
    systemPrompt: `Valuta le descrizioni prodotto.
Approva solo se sono persuasive, complete e senza errori.`,
    tools: [],
    responseFormat: z.object({
        approvato: z.boolean().describe("true se pronta, false se va migliorata"),
        feedback: z.string().describe("Suggerimenti per migliorare (vuoto se approvato)"),
    }),
});

function eseguiLoop(bozza, iterazione) {
    if (iterazione > maxIterazioni) {
        console.log("Limite raggiunto. Versione finale:\n", bozza);
        return Promise.resolve();
    }

    let nuovaBozza;

    return esecutore.invoke({ messages: [new HumanMessage(prompt)] })
        .then(risposta => {
            nuovaBozza = risposta.messages.at(-1).content;
            return critico.invoke({ messages: [new HumanMessage(`Valuta:\n${nuovaBozza}`)] });
        })
        .then(valutazione => {
            const { approvato, feedback } = valutazione.structuredResponse;
            if (approvato) {
                console.log("Approvata!\n", nuovaBozza);
                return Promise.resolve();
            }
            return eseguiLoop(`${nuovaBozza}\n\nFeedback: ${feedback}`, iterazione + 1);
        });
}
```

Il loop usa la ricorsione: `eseguiLoop` richiama se stessa con i dati aggiornati.
La variabile `nuovaBozza` è dichiarata fuori dai `.then()` per essere visibile
a entrambi i blocchi dello stesso ciclo — altrimenti il secondo `.then()` non
potrebbe accedere alla bozza prodotta dal primo.

**Punto chiave:** il Critico non riscrive, valuta e suggerisce. È l'Esecutore che
migliora a ogni ciclo. `maxIterazioni` è obbligatorio: senza, il loop potrebbe
non terminare mai se il Critico è troppo esigente.

---

## Confronto tra i tre pattern

| Pattern | Quando usarlo | Numero di chiamate API |
|---|---|---|
| Supervisor | Smistamento su tipi di richiesta diversi | 2 (supervisor + agente scelto) |
| Parallel | Analisi con più prospettive indipendenti | N agenti in parallelo + 1 aggregatore |
| Reflection | Quando la qualità dell'output deve essere validata | 2 per iterazione, fino a `maxIterazioni` |

I pattern sono componibili: un Supervisor può smistare verso un sotto-sistema
Parallel, oppure verso un agente che usa internamente Reflection.
