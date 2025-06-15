require('dotenv').config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const { generateWithAI,getAIContent } = require("./aiService");
const fetch = require('node-fetch'); // Use node-fetch instead of axios

const puppeteer = require('puppeteer'); // now using full puppeteer




let MESSAGES_DELAY = process.env.MESSAGES_DELAY || 10000; // 10 seconds

// console.log(process.env.MESSAGES_DELAY)









/****************************************  sql setup *************************************************/


const sqlite3 = require('sqlite3').verbose();
const dbSql = new sqlite3.Database('aiResponsOnMessages.db');

// Create table if not exists
dbSql.serialize(() => {
  dbSql.run(`CREATE TABLE IF NOT EXISTS messages (
        idIndex INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT,
        userId TEXT,
        senderPhoneNumber TEXT,
        message TEXT,
        date TEXT,
        aiResponse TEXT,
        dateTime TEXT
    )`);
});

// Function to save a message
async function saveMessage(userId, senderPhoneNumber, message, aiResponse) {
    const date = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
    const dateTime = new Date().toISOString(); // Full timestamp
    const id = `${userId}_${dateTime.replace(/[-:]/g, "").replace(".", "")}`; // Unique ID like 


    dbSql.run(
        "INSERT INTO messages ( id ,userId, senderPhoneNumber, message, date, aiResponse, dateTime) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, userId, senderPhoneNumber, message, date, aiResponse, dateTime],
        function (err) {
            if (err) return console.error("Error saving message:", err.message);
            // console.log("Message saved with ID:", this.lastID);
        }
    );
}

// Function to get all messages
async function getMessages() {
  return new Promise((resolve, reject) => {
    dbSql.all("SELECT * FROM messages", [], (err, rows) => {
      if (err) {
        console.error("Error fetching messages:", err.message);
        reject(err);
        return;
      }
      console.log("All messages:", rows);
      resolve(rows);
    });
  });
}



// Function to get all messages for a specific userId
async function getMessagesByUserId(userId) {
  return new Promise((resolve, reject) => {
    dbSql.all("SELECT * FROM messages WHERE userId = ?", [userId], (err, rows) => {
      if (err) {
        console.error("Error fetching messages:", err.message);
        reject(err);
        return;
      }
      // console.log(`Messages for userId ${userId}:`, rows);
      resolve(rows);
    });
  });
}




// Function to get the number of messages today, this week, this month, and this year for a specific userId
async function getMessageCounts(userId) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    const startOfWeekStr = startOfWeek.toISOString().split("T")[0].replace(/-/g, "/");
    const startOfMonthStr = startOfMonth.toISOString().split("T")[0].replace(/-/g, "/");
    const startOfYearStr = startOfYear.toISOString().split("T")[0].replace(/-/g, "/");

    dbSql.all(
      `SELECT 
        SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday,
        SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisWeek,
        SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisMonth,
        SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisYear
      FROM messages
      WHERE userId = ?`,
      [today, startOfWeekStr, startOfMonthStr, startOfYearStr, userId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching message counts:", err.message);
          reject(err);
          return;
        }
        resolve(rows[0]);
      }
    );
  });
}



// Function to get the number of messages from a specific date for a specific userId
async function getMessageCountsFromSpecificDate(userId, startDate) {
  //startDate format like "2025-03-14"

  return new Promise((resolve, reject) => {
    const formattedStartDate = new Date(startDate).toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
    dbSql.all(
      `SELECT 
        SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesFromDate,
        SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday
      FROM messages
      WHERE userId = ?`,
      [formattedStartDate, today, userId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching message counts from specific date:", err.message);
          reject(err);
          return;
        }
        resolve(rows[0]);
      }
    );
  });
}





(async () => {
  // Example Usage
  // await saveMessage("Omar","453453453", "Hello, how are you?", "I'm an AI. I'm good, thank you!");

  // await getMessageCounts("omarvenom22@gmail.com")
  // .then(counts => {
  //   console.log("Message counts:", counts);
  // })
  // .catch(error => {
  //   console.error("Error getting message counts:", error);
  // });



  // await getMessagesByUserId("omarvenom22@gmail.com").then((messages) => {
  //   console.log("Messages for user:", messages);
  // });

})();




/****************************************  sql setup *************************************************/














const userMessageQueues = {}; // Store queues for each user

function addToQueue(userId, message, processMessageCallback) {
    if (!userMessageQueues[userId]) {
        userMessageQueues[userId] = [];
    }

    userMessageQueues[userId].push(async () => {
        try {
            await processMessageCallback(message);
        } catch (error) {
            console.log(`Error processing message for user ${userId}:`, error);
            // logger.info(`Error processing message for user ${userId}:`, error);
        } finally {
            // Remove the processed task and continue to the next
            userMessageQueues[userId].shift();
            if (userMessageQueues[userId].length > 0) {
                userMessageQueues[userId][0](); // Process the next task
            }
        }
    });

    // Start processing the queue if it's the first message
    if (userMessageQueues[userId].length === 1) {
        userMessageQueues[userId][0]();
    }
}








let userCache = {};
async function getUserUpdateCached(userId) {
    const cacheDuration = 0.1 * 60 * 1000; // 0.5 minutes
    const now = Date.now();

    if (userCache[userId] && now - userCache[userId].timestamp < cacheDuration) {
        return userCache[userId].data;
    }

    try {
        const data = await getUserUpdate(userId);
        userCache[userId] = { data, timestamp: now };
        return data;
    } catch (error) {
        console.log(`Error fetching user update for user ${userId}:`, error);
        // logger.info(`Error fetching user update for user ${userId}:`, error);
        return null;
    }
}


async function getUserUpdate(userId) {
  try {
    const response = await fetch(`http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3100}/user-update/${userId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`Error fetching user update for user ${userId}:`, error);
    // logger.info(`Error fetching user update for user ${userId}:`, error);
    return null;
  }
}


async function updateUserQr(userId, qrLink) {
  try {
    const response = await fetch(`http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3100}/update-qr/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr: qrLink })
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`Error updating QR code for user ${userId}:`, error);
    // logger.info(`Error updating QR code for user ${userId}:`, error);
    return null;
  }
}

async function updateUser(userId, field, value) {
  try {
    const response = await fetch(`http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3100}/update-user-field/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value })  // Send both field and value
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`Error updating ${field} for user ${userId}:`, error);
    // logger.info(`Error updating ${field} for user ${userId}:`, error);
    return null;
  }
}



async function initializeClient(user) {
  user.dayAiResponelimit = user.dayAiResponelimit || 100; // Set a default limit if not defined


  // const sessionPath = path.join(__dirname, 'sessions', user.id);

  const isPackaged = process.pkg != null;
  const sessionPath = isPackaged
  ? path.join(process.cwd(), 'sessions', user.id)  // For packaged executable
  : path.join(__dirname, 'sessions', user.id);    // For development



  
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }



  console.log("STARTING CLIENT FOR USER: ", user.id);
  // logger.info("STARTING CLIENT FOR USER: ", user.id);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      // executablePath: './node_modules/puppeteer-core/.local-chromium/win64-1045629/chrome-win/chrome.exe',
      // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-crash-reporter',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-popup-blocking',
        '--window-size=800x600',
        '--single-process', // Runs the browser in a single process
        '--no-zygote', // Disables the zygote process
        '--no-experiments', // Disables experiments
        '--disable-web-security', // Disables web security (use with caution)
        '--disable-features=AudioServiceOutOfProcess', // Disables audio service
        // Add these args to limit CPU and memory usage
        '--disable-accelerated-2d-canvas',
        '--disable-backgrounding-occluded-windows',
        '--disable-software-rasterizer',
        '--disable-threaded-animation',
        '--disable-threaded-scrolling',
        '--disable-webgl',
        '--disable-features=TranslateUI',
        '--disable-features=NetworkService',
        '--disable-cache', // Disable the cache
        '--disk-cache-size=0', // Prevent caching on disk
      ],
      defaultViewport: null,
    },
  });






  // let qrTimeout= null; // Timer for QR code


  // if(user.isLogin!==true){


  //   client.on("qr", async (qr) => {
  //     let qrImageLink = await qrcode.toDataURL(qr); // Convert QR code to data URL
  
  //     // Update QR code for user
  //     await updateUserQr(user.id, qrImageLink);
  //     console.log(`QR code generated for user ${user.id} And Ready to scan`);
  //     // logger.info(`QR code generated for user ${user.id} And Ready to scan`);
  
  //     // Clear any existing timeout before setting a new one
  //     if (qrTimeout == null) {
        
  //       // Set a timeout to destroy the client if the QR code is not scanned
  //       qrTimeout = setTimeout(async () => {
        
  //               // get user from cache
  //               let userNew = await getUserUpdateCached(user.id);
  //               user=userNew;
        
  //               if(user.isLogin){
  //                 // console.log(`QR code for user ${user.id} scanned in time. Ignoring timeout.`);
  //                 return;
  //               }else{
        
  //                 // logger.info(`QR code for user ${user.id} not scanned in time. Destroying client.`);
          
  //                 client.removeAllListeners();
  //                 await new Promise(resolve => setTimeout(resolve, 10000)); // 1 second delay
            
            
  //                 await client.logout();
  //                 await new Promise(resolve => setTimeout(resolve, 5000)); // 1 second delay
            
  //                 await client.destroy();

          
  //                 // Update Firebase with logout status
  //                 const db = admin.firestore();
  //                 const userRef = db.collection('users').doc(user.id);
  //                 try {
  //                     await userRef.update({ isLogin: false });
  //                     await userRef.update({ isDisconnected: true });
  //                     user.isLogin = false;
  //                     user.qr = null; // Clear QR code on disconnect
  //                     user.isDisconnected = true;
  //                     updateUser(user.id,'qr', null);
  //                     updateUser(user.id,'isDisconnected', true);
  //                     console.log(`User ${user.id} logout status updated in Firebase`);
  //                 } catch (error) {
  //                     console.log(`Error updating user ${user.id} logout status in Firebase: `, error);
  //                 }
  //               }
        
        
          
  //       }, 180000); // 120 seconds = 2 minutes (adjust this duration as needed)

  //     }

  //   });
  


  //   client.on("authenticated", () => {
  //     // console.log(`Client for user ${user.id} authenticated successfully!`);

  //     if(qrTimeout!==null){
  //       clearTimeout(qrTimeout); // Prevent QR timeout cleanup
  //     }

  //     // Update user login status in Firebase
  
  //     if (!admin.apps.length) {
  //       admin.initializeApp({
  //         credential: admin.credential.cert(serviceAccount),
  //       });
  //     }
  
  //     if(!user.isLogin){
  
  //       const db = admin.firestore();
  //       const userRef = db.collection('users').doc(user.id);
    
  //       userRef.update({ isLogin: true })
  //         .then(() => {
  //         // console.log(`User ${user.id} login status updated in Firebase`);
  //         })
  //         .catch((error) => {
  //         console.log(`Error updating user ${user.id} login status in Firebase: `, error);
  //         // logger.info(`Error updating user ${user.id} login status in Firebase: `, error);
  //         });
  //       user.isLogin = true;
  //       if(!user.isDisconnected){
  //         userRef.update({ isDisconnected: false })
  //       }
  
  //     }
  
  //   });



  // }



  let qrTimeout = null; // Timer for QR code

  if (!user.isLogin) {
    // Function to handle QR generation
    const generateQRCode = async () => {
      try {
        client.on("qr", async (qr) => {
          let qrImageLink = await qrcode.toDataURL(qr); // Convert QR code to data URL
  
          // Update QR code for user
          await updateUserQr(user.id, qrImageLink);
          console.log(`QR code generated for user ${user.id} and ready to scan`);
  
          // Clear any existing timeout before setting a new one
          if (!qrTimeout) {
            qrTimeout = setTimeout(async () => {
              await handleTimeout(user);
            }, 180000); // 3 minutes timeout (adjust as needed)
          }
        });
      } catch (error) {
        console.error(`Error generating QR code for user ${user.id}:`, error);
      }
    };
  
    // Function to handle timeout and logout process
    const handleTimeout = async (user) => {
      try {
        const userNew = await getUserUpdateCached(user.id);
        user = userNew;
  
        if (user.isLogin) {
          // If the user is logged in, ignore timeout
          console.log(`User ${user.id} logged in within the timeout period. Skipping logout.`);
          return;
        } else {
          // Notify the user about timeout and log them out
          console.log(`QR code for user ${user.id} not scanned in time. Destroying client.`);
          await logoutAndClearUserData(user);
        }
      } catch (error) {
        console.error(`Error handling timeout for user ${user.id}:`, error);
      }
    };
  
    // Function to handle user logout and update Firebase
    const logoutAndClearUserData = async (user) => {
      try {
        client.removeAllListeners();
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds delay
        await client.logout();
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
        await client.destroy();
  
        // Update Firebase with logout status
        const db = admin.firestore();
        const userRef = db.collection('users').doc(user.id);
        await userRef.update({ isLogin: false, isDisconnected: true });
        user.isLogin = false;
        user.qr = null; // Clear QR code on disconnect
        user.isDisconnected = true;
        updateUser(user.id, 'qr', null);
        updateUser(user.id, 'isDisconnected', true);
        console.log(`User ${user.id} logout status updated in Firebase`);
      } catch (error) {
        console.error(`Error during logout and Firebase update for user ${user.id}:`, error);
      }
    };
  
    // Listen for successful authentication
    const handleAuthentication = async () => {
      try {
        if (qrTimeout !== null) {
          clearTimeout(qrTimeout); // Prevent QR timeout cleanup
        }
  
        // Update user login status in Firebase (initialize Firebase if needed)
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
        }
  
        if (!user.isLogin) {
          const db = admin.firestore();
          const userRef = db.collection('users').doc(user.id);
          await userRef.update({ isLogin: true, isDisconnected: false });
          user.isLogin = true;
          console.log(`User ${user.id} login status updated in Firebase`);
        }
      } catch (error) {
        console.error(`Error handling authentication for user ${user.id}:`, error);
      }
    };
  
    // Listen for successful authentication
    client.on("authenticated", handleAuthentication);
  
    // Listen for QR code generation
    generateQRCode();
  
    // Function to manually trigger the QR code generation after timeout
    const requestNewQRCode = async () => {
      if (!user.isLogin) {
        console.log(`Requesting a new QR code for user ${user.id}`);
        await generateQRCode();
      }
    };
  }
  




  client.on("ready", async () => {
    console.log(`Client for user ${user.id} is ready!`);
    // logger.info(`Client for user ${user.id} is ready!`);
    user.lastReadyTime = Math.floor(Date.now() / 1000); // Track readiness time


    

    // Handle incoming messages

    // client.on("message", async message => {

    //   // Ignore messages from groups or statuses
    //   if (message.from === "status@broadcast" || message.from.endsWith("@g.us")) {
    //     return;
    //   }
    
    
    
    //   try {
    //     let userNew = await getUserUpdateCached(user.id);
        
    //     user=userNew;
    
    
    //     let currentHour = new Date().getHours();
    //     // Check if the current time is within the allowed range
    //     if (!isCurrentTimeInRange(user.startHour, user.startHourampm, user.endHour, user.endHourampm,currentHour)) {
    //       console.log(`Chatbot for user (${user.id}) is inactive. Outside allowed hours. Current Hour: `,currentHour, "Start Hour: ", user.startHour , "End Hour: ", user.endHour);
    //       // logger.info(`Chatbot for user (${user.id}) is inactive. Outside allowed hours. Current Hour: `,currentHour, "Start Hour: ", user.startHour , "End Hour: ", user.endHour);
    //       return;  // Ignore the message if outside allowed hours
    //     }
    
    
    
    //     // Check if message timestamp is less than current time
    //     if (message.timestamp < user.lastReadyTime) {
    //       // console.log("Message is old. Ignoring.");
    //       return;
    //     }
    
        
    //       let userMessage = message.body;
    //       if (!userMessage.trim()) {
    //         // console.log("Empty message received. Ignoring.");
    //         return;
    //       }
    
    //     // Fetch the chat of the sender
    //     let chat = await message.getChat();
    //     let messages = await chat.fetchMessages({ limit: 5 });
        
    
    //     let oldChats = messages.map((msg) => `[${msg.fromMe ? '' : ''}]: ${msg.body}`).join("\n");
    
    //     if(user.isActive!==false){
    //       console.log(`New message for user (${user.id}) from (${chat.name || chat.id.user}) - ${message.from}`);


    //       let aiResponse = await getAIContent(oldChats, user, message.body);
    //       // let aiResponse = await generateWithAI(oldChats, user, message.body);
          
    //       if ( aiResponse.trim() && user.isActive !== false) {
    //           await message.reply(aiResponse);
    //           console.log(`AI Response sent for user ${user.id}`);

    //           let senderPhoneNumber = message.from;
    //           // remove @c.us
    //           if(senderPhoneNumber.includes('@c.us')){
    //             senderPhoneNumber = senderPhoneNumber.replace('@c.us','');
    //           }

    //           let messageText = message.body;

    //           saveMessage(`${user.id}`,`${senderPhoneNumber}`, `${messageText}`, `${aiResponse}`);



    //           // logger.info(`AI Response sent for user ${user.id}`);
    //       } else {
    //           console.log(`Chatbot for user (${user.id}) is Stoped. Ignored AI response.`);
    //           // logger.info(`Chatbot for user (${user.id}) is Stoped. Ignored AI response.`);
    //       }



    //     } else {
    //       console.log(`New message for user (${user.id}) from (${chat.name || chat.id.user}) - ${message.from} But Chatbot is Stoped.`);
    //       // logger.info(`Chatbot for user (${user.id}) is Stoped.`);
    //     }
    
    
    
    //     } catch (error) {
    //       console.log("Error in message handler:", error);
    //       // logger.info("Error in message handler:", error);
    //     }
    // });


    const messageQueues = {}; // Store messages per sender
    const messageTimers = {}; // Store timers per sender

    client.on("message", async (message) => {
      // Ignore messages from groups or statuses
      if (message.from === "status@broadcast" || message.from.endsWith("@g.us")) {
        return;
      }

      try {
        let userNew = await getUserUpdateCached(user.id);
        user = userNew;

        let currentHour = new Date().getHours();
        if (!isCurrentTimeInRange(user.startHour, user.startHourampm, user.endHour, user.endHourampm, currentHour)) {
          console.log(`Chatbot for user (${user.id}) is inactive. Outside allowed hours.`);
          return;
        }

        if (message.timestamp < user.lastReadyTime) {
          return;
        }

        let senderPhoneNumber = message.from.replace("@c.us", ""); // Clean phone number
        let userMessage = message.body.trim();
        if (!userMessage) {
          return;
        }

        // Initialize queue if not exist
        if (!messageQueues[senderPhoneNumber]) {
          messageQueues[senderPhoneNumber] = [];
        }

        // Push message to queue
        messageQueues[senderPhoneNumber].push(userMessage);
        // console.log("start timer")

        // If a timer already exists, reset it
        if (messageTimers[senderPhoneNumber]) {
          clearTimeout(messageTimers[senderPhoneNumber]);
        }


        
        // Set a timer to process messages after 10 seconds
        messageTimers[senderPhoneNumber] = setTimeout(async () => {
          let combinedMessage = messageQueues[senderPhoneNumber].join("\n");
          delete messageQueues[senderPhoneNumber]; // Clear queue
          delete messageTimers[senderPhoneNumber]; // Clear timer reference

          let chat = await message.getChat();
          let messages = await chat.fetchMessages({ limit: 5 });
          let oldChats = messages.map((msg) => `[${msg.fromMe ? "" : ""}]: ${msg.body}`).join("\n");



          let messageCounts = await getMessageCountsFromSpecificDate(user.id,user.tokenData.tokenActivatedAt);

          let aiResponsesToday = messageCounts.messagesToday;
          let aiResponsesThisMonth = messageCounts.messagesFromDate;
          // console.log(`AI responses for user ${user.id} today: ${aiResponsesToday} / ${user.tokenData.dayLimit}`);
          // console.log(`AI responses for user ${user.id} Limit: ${aiResponsesThisMonth}  / ${user.tokenData.monthLimit}`);


          if (aiResponsesThisMonth >= user.tokenData.monthLimit) {
            console.log(`User ${user.id} has reached the month limit of AI responses.`);
            return;
          }

          if (aiResponsesToday >= user.tokenData.dayLimit) {
            console.log(`User ${user.id} has reached the day limit of AI responses.`);
            return;
          }






          if (user.isActive !== false) {
            console.log(`Processing message from (${chat.name || chat.id.user}) - ${senderPhoneNumber}`);
            // console.log(`Combined message: ${combinedMessage}`);
            let aiResponse = await getAIContent(oldChats, user, combinedMessage);
            if (aiResponse.trim() && user.isActive !== false) {
              await message.reply(aiResponse);
              console.log(`AI Response sent for user ${user.id}`);

              saveMessage(`${user.id}`, `${senderPhoneNumber}`, `${combinedMessage}`, `${aiResponse}`);
            } else if (user.isActive !== true) {
              console.log(`Chatbot for user (${user.id}) is stopped. Ignored AI response.`);
            }
             else {
              console.log(`respone is empty: ${aiResponse}`);
            }
          }


        },MESSAGES_DELAY); // 15-second delay
      } catch (error) {
        console.log("Error in message handler:", error);
      }
    });






  
  
  });



  // client.on("disconnected", async (reason) => {
  //   console.log(`Client for user ${user.id} disconnected: ${reason}`);
  //   // logger.info(`Client for user ${user.id} disconnected: ${reason}`);
  //   const db = admin.firestore();
  //   const userRef = db.collection('users').doc(user.id);



  //   console.log(`Start Cleaning up client ${user.id} resources...`);
  //   // logger.info(`Start Cleaning up client ${user.id} resources...`);

  //   // Clear the previous QR timeout to prevent unexpected behavior
  //   clearTimeout(qrTimeout);

    
  //   // Wait for 20 seconds before cleaning up client resources
  //   setTimeout(async () => {
  //       try {
  //           if (client) {
  //               await client.logout();
  //               // console.log("Logged out successfully.");

  //               client.removeAllListeners();
  //               // console.log("Listeners removed successfully.");
  //           }

  //           if (client.pupPage && !client.pupPage.isClosed()) {
  //               await client.pupPage.close();
  //               // console.log("Puppeteer page closed successfully.");
  //           }

  //           if (client) {
  //               await client.destroy();
  //               // console.log("Client resources cleaned up successfully.");
  //               user.qr = null; // Clear QR code on disconnect
  //           }


     
  //           try {
  //               await userRef.update({ isLogin: false });
  //               await userRef.update({ isDisconnected: true });
  //               user.isLogin = false;
  //               user.qr = null; // Clear QR code on disconnect
  //               await updateUser(user.id,'isDisconnected', true).then(response => {
  //                 console.log(response);
  //                 // logger.info(response);
  //               })
  //               .catch(error => {
  //                 console.log(error);
  //                 // logger.info(error);
  //               });

  //           } catch (error) {
  //               console.log(`Error updating user ${user.id} logout status in Firebase: `, error);
  //               // logger.info(`Error updating user ${user.id} logout status in Firebase: `, error);
  //           }


  //       } catch (error) {
  //           console.log("Error during client cleanup:", error);
  //           // logger.info("Error during client cleanup:", error);
  //       }
  //   }, 20000); // 20000 ms = 20 seconds
  // });




  client.on("disconnected", async (reason) => {
    console.log(`Client for user ${user.id} disconnected: ${reason}`);

    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.id);

    console.log(`Start Cleaning up client ${user.id} resources...`);

    // Clear the previous QR timeout to prevent unexpected behavior
    clearTimeout(qrTimeout);

    // Wait for 20 seconds before cleaning up client resources
    setTimeout(async () => {
        try {
            if (client) {
                await client.logout().catch(err => console.log("Logout error:", err));

                client.removeAllListeners();
            }

            if (client.pupPage) {
                try {
                    if (!client.pupPage.isClosed()) {
                        await client.pupPage.close();
                    }
                } catch (error) {
                    console.log("Error closing Puppeteer page:", error);
                }
            }

            if (client) {
                await client.destroy().catch(err => console.log("Destroy error:", err));
                user.qr = null; // Clear QR code on disconnect
            }

            try {
                await userRef.update({ isLogin: false, isDisconnected: true });
                user.isLogin = false;
                user.qr = null; // Clear QR code on disconnect

                await updateUser(user.id, 'isDisconnected', true)
                    .then(response => console.log(response))
                    .catch(error => console.log(error));

            } catch (error) {
                console.log(`Error updating user ${user.id} logout status in Firebase: `, error);
            }

        } catch (error) {
            console.log("Error during client cleanup:", error);
        }
    }, 20000); // 20 seconds delay
});



 






  process.on('SIGINT', async () => {
    console.log('Closing Puppeteer...');
    // logger.info('Closing Puppeteer...');
      await client.destroy();
      process.exit();
  });

  
 
 
 
 
  client.on("auth_failure", msg => {
    console.log(`Authentication failed for user ${user.id}: ${msg}`);
    // logger.info(`Authentication failed for user ${user.id}: ${msg}`);
    user.qr = null; // Clear QR code on auth failure
  });


  client.on("change_state", state => {
    console.log(`Client for user ${user.id} changed state: ${state}`);
    // logger.info(`Client for user ${user.id} changed state: ${state}`);
  });

 



  client.on("uncaughtException", (err) => {
    console.log(`Uncaught ${user.id} Exception:`, err);
    // logger.info("Uncaught Exception:", err);
  });
  
  client.on("unhandledRejection", (reason, promise) => {
    console.log(`Unhandled ${user.id} Rejection:`, reason);
    // logger.info("Unhandled Rejection:", reason);
  });

  client.on("close", (err) => {
    console.log(`Client ${user.id} closed:`, err);
    // logger.info("Client closed:", err);
  });









  

  client.initialize();
  return client;
}






function isCurrentTimeInRange(startHour, startHourampm, endHour, endHourampm,currentHour) {
  // Convert start and end hours to 24-hour format
  let start = convertTo24Hour(startHour, startHourampm);
  let end = convertTo24Hour(endHour, endHourampm);
  // console.log(start+" - "+end);
  // Handle the range logic
  if (start <= end) {
    // Range does not cross midnight
    return currentHour >= start && currentHour <= end;
  } else {
    // Range crosses midnight
    return currentHour >= start || currentHour <= end;
  }
}

function convertTo24Hour(hour, ampm) {

  if(hour==null || ampm==null || hour=="" || ampm=="" || hour==undefined || ampm==undefined){ 
    // return default value
    return 0;
    
  }else if (ampm.toLowerCase() === "am") {
    return hour === 12 ? 0 : hour;
  } else {
    return hour === 12 ? 12 : hour + 12;
  }
}

module.exports = { initializeClient };