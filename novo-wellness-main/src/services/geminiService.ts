import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { MessageContent } from '@langchain/core/messages';
import { ObjectId } from 'mongodb';
 
// Fallback responses when the AI service is unavailable
const FALLBACK_RESPONSES = {
  anxiety: `# Anxiety Assessment Results\n\n## Understanding Your Score\nYour responses suggest some level of anxiety. This is completely normal and many students experience similar feelings.\n\n## Key Observations\n- You may be experiencing some anxious thoughts or feelings\n- These responses are common during stressful periods\n\n## Recommendations\n1. Practice deep breathing exercises\n2. Try mindfulness or meditation\n3. Maintain a regular sleep schedule\n4. Talk to someone you trust about how you're feeling\n5. Consider speaking with a counselor if these feelings persist`,
 
  depression: `# Depression Assessment Results\n\n## Understanding Your Score\nYour responses indicate some symptoms that may be related to depression.\n\n## Key Observations\n- You might be experiencing low mood or lack of motivation\n- These feelings are common and treatable\n\n## Recommendations\n1. Reach out to friends or family for support\n2. Try to maintain a daily routine\n3. Engage in physical activity, even a short walk\n4. Consider speaking with a mental health professional\n5. Be patient with yourself - recovery takes time`,
 
  stress: `# Stress Assessment Results\n\n## Understanding Your Score\nYour responses suggest you may be experiencing stress.\n\n## Key Observations\n- You might be feeling overwhelmed\n- Stress can affect both physical and mental health\n\n## Recommendations\n1. Identify your stress triggers\n2. Practice time management\n3. Take regular breaks\n4. Try relaxation techniques\n5. Ensure you're getting enough sleep`,
 
default: `# Assessment Results\n\n## Understanding Your Score\nWe're currently experiencing high demand for our AI analysis service.\n\n## What You Can Do\n1. Try again in a few minutes\n2. Review your responses and reflect on how you've been feeling\n3. Consider speaking with a counselor about your results\n\nWe apologize for the inconvenience and appreciate your patience.`
};
 
// Get API key from environment variables
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
 
// Initialize the ChatGroq client
const chat = API_KEY ? new ChatGroq({
  apiKey: API_KEY,
  model: "llama3-70b-8192",
  temperature: 0.7,
  maxTokens: 1024
}) : null;
 
// Check if the message indicates the conversation should end
const shouldEndConversation = (message: string): boolean => {
  const lowerMessage = message.toLowerCase().trim();
  const endPhrases = [
    'ok', 'okay', 'thanks', 'thank you', 'bye', 'goodbye',
    'that\'s all', 'i\'m done', 'i am done', 'that\'s it',
    'got it', 'alright', 'cool', 'great', 'thanks for your help',
    'thank you for your help', 'i appreciate it', 'appreciate it'
  ];
 
  return endPhrases.some(phrase => lowerMessage === phrase ||
    lowerMessage.startsWith(phrase + ' ') ||
    lowerMessage.endsWith(' ' + phrase) ||
    lowerMessage.includes(' ' + phrase + ' '));
};
 
export const generateResponse = async (prompt: string, chatHistory: Array<{role: string, content: string}>) => {
  if (!API_KEY || !chat) {
    console.warn(' using fallback response');
    return getFallbackResponse(prompt);
  }
 
  // Check if the user wants to end the conversation
  if (shouldEndConversation(prompt)) {
    return "You're welcome, I'm always here if you need to talk. Take care and remember, you're doing great! 💙";
  }
 
  try {
    const systemMessage = `You are a friendly and supportive chatbot friend for kids.
    You speak in simple, easy-to-understand English with a warm and caring tone.
 
    Important rules:
    1. Always be positive, encouraging, and patient
    2. Use simple words and short sentences
    3. Be a good listener and show you care
    4. If a child seems upset, be extra kind and supportive
    5. If the child says something that sounds like they want to end the conversation (like 'ok', 'thanks', 'bye'),
       respond with a short, warm closing message and don't ask follow-up questions
 
    If a child needs help, you can tell them to talk to:
    - A trusted adult (parents, teacher, or relative)
    - Childline: 1098 (24/7, toll-free)
    - Kids Helpline: 1800-121-2830
 
    For emergencies:
    - Police: 100
    - Ambulance: 108
 
    Remember to always be kind and helpful!`;
 
    // Check if the last message was a closing message to avoid continuing the conversation
    const lastMessage = chatHistory[chatHistory.length - 1]?.content?.toLowerCase() || '';
    if (shouldEndConversation(lastMessage)) {
      return "Take care, beta! Remember, I'm always here if you need to talk. 💙";
    }
 
    const messages = [
      new SystemMessage(systemMessage),
      ...chatHistory.map(msg =>
        msg.role === 'user'
          ? new HumanMessage(msg.content)
          : new SystemMessage(msg.content)
      ),
      new HumanMessage(prompt)
    ];
 
    const response = await chat.invoke(messages);
    let responseText = response.content as string;
   
    // Ensure the response is appropriate if it's a closing message
    if (shouldEndConversation(prompt)) {
      responseText = "You're welcome, beta! I'm always here if you need to talk. Take care and remember, you're doing great! 💙";
    }
   
    return responseText;
  } catch (error) {
    console.error('Error getting chat response:', error);
    return getFallbackResponse(prompt);
  }
};
 
// Helper function to get appropriate fallback response based on prompt content
const getFallbackResponse = (prompt: string): string => {
  const lowerPrompt = prompt.toLowerCase();
 
  if (lowerPrompt.includes('anxiety') || lowerPrompt.includes('anxious')) {
    return FALLBACK_RESPONSES.anxiety;
  } else if (lowerPrompt.includes('depress') || lowerPrompt.includes('sad')) {
    return FALLBACK_RESPONSES.depression;
  } else if (lowerPrompt.includes('stress') || lowerPrompt.includes('overwhelm')) {
    return FALLBACK_RESPONSES.stress;
  }
 
  return FALLBACK_RESPONSES.default;
};
 
export interface SessionSummary {
  focusArea: string;
  keyPoints: string[];
  actionPlan: string[];
}
 
export const generateSessionSummary = async (transcript: string): Promise<SessionSummary> => {
  try {
    if (!API_KEY || !chat) {
      throw new Error('Chat service not initialized');
    }
 
    const prompt = `Analyze the following therapy session transcript and provide a structured summary. Focus on:
    1. Main focus area (1-2 sentences)
    2. 3-5 key points discussed
    3. 2-3 action items for the client\n\nTranscript: ${transcript}\n\nFormat the response as a JSON object with these exact keys: focusArea, keyPoints, actionPlan`;
 
    const messages = [
      new SystemMessage("You are a helpful assistant that analyzes therapy sessions and provides structured summaries."),
      new HumanMessage(prompt)
    ];
 
    const response = await chat.invoke(messages);
    const text = response.content as string;
   
    // Extract JSON from markdown code block if present
    let jsonString = text;
    const jsonMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    }
   
    const summary = JSON.parse(jsonString);
   
    return {
      focusArea: summary.focusArea || 'General discussion',
      keyPoints: Array.isArray(summary.keyPoints) ? summary.keyPoints : [],
      actionPlan: Array.isArray(summary.actionPlan) ? summary.actionPlan : []
    };
  } catch (error) {
    console.error('Error generating session summary:', error);
    return {
      focusArea: 'Session overview',
      keyPoints: ['Summary generation unavailable at this time'],
      actionPlan: ['Review session notes', 'Schedule follow-up if needed']
    };
  }
};
 
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  // Note: Audio transcription would require a dedicated audio processing service
  // This is a placeholder implementation
  try {
    if (!API_KEY || !chat) {
      throw new Error('Chat service not initialized');
    }
 
    const prompt = "This is a placeholder for audio transcription. The actual implementation would require a dedicated audio processing service.";
    const messages = [
      new SystemMessage("You are a helpful assistant that processes audio transcripts."),
      new HumanMessage(prompt)
    ];
 
    const response = await chat.invoke(messages);
    return response.content as string;
  } catch (error) {
    console.error('Error processing audio:', error);
    throw new Error('Audio processing is currently unavailable. Please try again later.');
  }
};
