






const fetch = require("node-fetch");
const OpenAI = require("openai");


const API_URL = "https://api.voids.top/v1/chat/completions";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: DEEPSEEK_API_KEY,
});

const models = [
  "gpt-4o-mini",
  "gpt-4o-free",
  "grok-2-mini",
  "gpt-4o-mini-free",
  "gemini-1.5-flash-exp-0827",
  "gpt-4-turbo-2024-04-09",
  "gpt-4o-2024-08-06",
  "claude-3-opus-20240229",
  "claude-3-opus-20240229-gcp",
  "claude-3-sonnet-20240229",
  "claude-3-5-sonnet-20240620",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "gemini-1.5-pro-exp-0827",
];

// Common AI request handler
// async function getAIResponse(messagesPayload) {
//   for (let model of models) {
//     try {
//       const response = await fetch(API_URL, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           model,
//           messages: messagesPayload,
//           max_tokens: 100,
//           stop: ["\n"],
//           temperature: 0.5,
//           top_p: 1,
//           frequency_penalty: 0,
//           presence_penalty: 0,
//           stream: false,
//           type: "text",
//         }),
//         timeout: 20000,
//       });

//       if (response.ok) {
//         const data = await response.json();
//         if (data.choices && data.choices.length > 0) {
//           console.log("Model:", model, "success");
//           return parseStreamingResponse(data.choices[0].message.content);
//         }
//       }
//     } catch (error) {
//       console.error(`Error with model ${model}:`, error.message);
//     }
//   }

//   // If all models fail or all models data.choices[0].message.content return empty, fallback to DeepSeek
//   return await getDeepSeekResponse(messagesPayload);
// }



// Common AI request handler
async function getAIResponse(messagesPayload) {
  for (let model of models) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messagesPayload,
          max_tokens: 100,
          stop: ["\n"],
          temperature: 0.5,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          stream: false,
          type: "text",
        }),
        timeout: 20000,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
          const content = data.choices[0].message.content.trim();
          if (content) {
            console.log("Model:", model, "success");
            return parseStreamingResponse(content);
          }
        }
      }
    } catch (error) {
      console.error(`Error with model ${model}:`, error.message);
    }
  }

  // If all models fail or return empty content, fallback to DeepSeek
  return await getDeepSeekResponse(messagesPayload);
}









// DeepSeek API Fallback
async function getDeepSeekResponse(messagesPayload) {
  try {
    const completion = await openai.chat.completions.create({
      messages: messagesPayload,
      model: "deepseek-chat",
    });
    console.log("DeepSeek API success");
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek API failed:", error.message);
    return ""; // Return empty text on failure
  }
}


// Main function to get AI content
async function getAIContent(oldChats, user, userMessage) {
  console.log("Start getting AI response for user:", user.id);

  let userRules = user.rules || "";
  const predefinedRules = `
    You are an AI assistant. Your job is to respond accurately and concisely.
    Rules:
    - Respond based on conversation context.
    ( ${userRules} )
    - Ensure fast and structured replies.
    - Compare new responses with previous messages to avoid repetition.
    - Keep conversation context by reviewing the last ten messages.
    - If the user repeats the same question, provide a more detailed response or ask clarifying questions.
    - If unsure, acknowledge and ask for more details.
    - Suggest human support if the conversation reaches a deadlock.

    Old Chats: (${oldChats})
    Please respond to: ${userMessage}
  `.trim();

  const messagesPayload = [{ role: "system", content: predefinedRules }];
  return await getAIResponse(messagesPayload);
}

// Quick AI response function
async function askAi(message) {
  console.log("Start getting AI response for message:", message);

  const messagesPayload = [{ role: "system", content: message }];
  return await getAIResponse(messagesPayload);
}

// Streaming response parser
function parseStreamingResponse(rawData) {
  try {
    if (rawData.includes('"content":')) {
      const matches = rawData.match(/"content":"(.*?)"/g);
      if (!matches) return rawData.trim();
      return matches
        .map(match => match.replace(/"content":"|"/g, ''))
        .join('')
        .replace(/\\n/g, '\n')
        .trim();
    } else {
      return rawData.trim();
    }
  } catch (error) {
    console.error("Error parsing response:", error);
    return rawData;
  }
}

module.exports = { getAIContent, askAi };















