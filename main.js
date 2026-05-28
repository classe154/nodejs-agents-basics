import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent, HumanMessage, tool } from 'langchain';
import { z } from 'zod';

const meteo = ({ luogo }) => {
    return fetch('http://www.google.com')
        .then(() => {
            return 'Ci sono 20 gradi e 5 nodi di vento'
        });
}

const meteoTool = tool(meteo, {
    name: 'get_meteo',
    description: 'Tool per ottenere il meteo per un determinato luogo',
    schema: z.object({
        luogo: z.string().describe('Il luogo del quale vuoi sapere il meteo')
    })
});

const model = new ChatAnthropic({
    model: 'claude-haiku-4-5',
    apiKey: process.env.CLAUDE_API_KEY
});

const agentResponseFormat = z.object({
    gradi: z.string().describe('I gradi della risposta del meteo'),
    vento: z.number().describe('La forza del vento contenura nella risposta')
});

const agentGenerico = createAgent({
    model,
});

const agentMeteo = createAgent({
    model,
    tools: [meteoTool],
    responseFormat: agentResponseFormat
});

const userMessage = `
Ciao com'è il meteo a Pisa
`;

let agentChoose = agentGenerico;

if (userMessage.includes('meteo')) {
    agentChoose = agentMeteo;
}

agentChoose.invoke({
    messages: [
        new HumanMessage(userMessage)
    ]
}).then(response => {
    console.log(response.messages.at(-1).content);
});