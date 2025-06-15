const path = require('path');
const cors = require('cors');
console.log("V.012");
const currentDateTime = new Date();
console.log(`Current Date and Time: ${currentDateTime}`); // Current Date and Time: 2021-09-30T12:00:00.000Z
/****************************************  firebase setup *************************************************/





/****************************************  electron js setup *************************************************/


// const { app, BrowserWindow } = require('electron');

// // Create a new browser window when Electron is ready
// function createWindow() {
//   const win = new BrowserWindow({
//     width: 800,
//     height: 600,
//     webPreferences: {
//       nodeIntegration: true
//     }
//   });

//   // Load your Node.js application (or HTML file if you have a UI)
//   win.loadURL('http://localhost:3100/admin'); // or win.loadURL('http://localhost:3000') if it's a web app
// }

// app.whenReady().then(createWindow);

// // Quit the app when all windows are closed (for macOS compatibility)
// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit();
//   }
// });

// // Re-create the window on macOS when clicking the app icon
// app.on('activate', () => {
//   if (BrowserWindow.getAllWindows().length === 0) {
//     createWindow();
//   }
// });

/****************************************  electron js setup *************************************************/







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
            console.log("Message saved with ID:", this.lastID);
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
  //   console.log("Messages for user:", messages.length);
  // });

})();





// await getMessageCounts("omarvenom22@gmail.com")
// .then(counts => {
//   console.log("Message counts:", counts);
// })
// .catch(error => {
//   console.error("Error getting message counts:", error);
// });


/****************************************  sql setup *************************************************/









const express = require("express");
// const path = require("path");
const { db } = require("./firebase");
const { initializeClient } = require("./whatsappClient");
const { PORT } = require("./config");
// const fs = require("fs");
const rimraf = require("rimraf");
const fs = require("fs").promises; // Use promises for async fs operations
const { generateWithAI,getAIContent,askAi } = require("./aiService");



const appExpress = express();
appExpress.use(express.urlencoded({ extended: true }));
appExpress.use(express.json());

let clients = [];
let users = [];




async function loadUsersFromFirestore() {
  try {
    const usersCollection = await db.collection("users").get();

    if (usersCollection.empty) {
      console.log("No users found.");
      return [];
    }

    const users = [];
    usersCollection.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });

    // console.log("Users loaded successfully:", users);
    return users;
  } catch (error) {
    console.error("Error loading users from Firestore:", error);
    return [];
  }
}










// Load users from Firestore and initialize clients
async function loadUsers() {
  const usersCollection = await db.collection("users").get();
  if (usersCollection.empty) return console.log("No users found.");

  users = usersCollection.docs.map(doc => ({ id: doc.id, ...doc.data() }));


  const loggedInUsers = users.filter(user => user.isLogin).length;
  console.log(" ")
  console.log(`Total users: ${users.length} | Logged in users: ${loggedInUsers} | Not logged in: ${users.length - loggedInUsers}`);
  const delayTime = process.env.USER_PROCESS_DELAY || 30000; // Default to 30 seconds if not set in .env
  console.log(`it will take ${(loggedInUsers * (delayTime / 1000) ) / 60} minute to start all logged in users`);
  console.log(" ")
  // Function to add a delay (in milliseconds)
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  for (const user of users) {
    if (user.isLogin) {
      try {
        let client = await initializeClient(user);
        clients.push({ id: user.id, client });
      } catch (error) {
        console.error(`Error initializing client for user ${user.id}:`, error);
      }

      // Wait for the specified delay before processing the next user
      await delay(delayTime);
    } else {
      console.log(`${user.id} not login`);
    }
  }
  
}

loadUsers();

// get start and end hours from file
let startHour = 12;
let startHourampm = "AM";
let endHour = 11;
let endHourampm = "PM";









appExpress.post("/send-message", async (req, res) => {
  const { userId, phoneNumber, message, countryCode } = req.body;

  try {
    let chatId = `${countryCode}${Number(phoneNumber)}@c.us`;
    const client = clients.find(c => c.id === userId)?.client;
    if (!client) {
      return res.status(404).send("Client not found");
    }
    await client.sendMessage(chatId, message);
    res.status(200).send("Message sent successfully!");
  } catch (error) {
    // console.error("Error sending message:", error);
    res.status(500).send("Error sending message.");
  }
});








appExpress.get("/admin", (req, res) => {


  loadUsersFromFirestore().then((usersFromFirestore) => {
    const loggedInUsers = usersFromFirestore.filter(user => user.isLogin).length;
    if (usersFromFirestore.length > 0) {
      users = usersFromFirestore;

    } else {
      console.log("No users to display.");
    }

    let textToSow=`Total users: ${users.length} | Logged in users: ${loggedInUsers} | Not logged in: ${users.length - loggedInUsers}`


    let usersTable = users.map((user, index) => {
      return `
        <tr>
          <td>${user.id}</td>
          <td>
            <button style="background-color: #904caf; margin: 5px;" onclick="showPassword('${user.id}')">Show</button>
          </td>
          <td>
            <button onclick="showRules('${user.id}')">View Rules</button>
          </td>
          <td>
            <a href="/user.html?userId=${user.id}">User Page</a>
          </td>
          <td>
          ${user.isLogin}
          </td>
          <td>
          ${user.isActive==true?"Active":"Not Active"}
          </td>
          <td>
            <button style="background-color: #d32f2f; margin: 5px;" onclick="removeUser('${user.id}')">Remove User</button>
            <button style="display: none;" style="background-color: #504caf; margin: 5px;" onclick="editUser('${user.id}')">Edit User</button>
            <button style="background-color: #d32f2f; margin: 5px;" onclick="logoutUser('${user.id}')">Logout User</button>

          </td>
        </tr>
      `;
    }).join('');

    res.send(`
      <html>
      <head>
      <style>
      body { font-family: Arial, sans-serif; background-color: #f4f4f9; padding: 20px; min-width: 1000px; }
      table { width: 100%; border-collapse: collapse; }
      table, th, td { border: 1px solid #ddd; }
      th, td { padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
      button {     border-radius: 5px; padding: 10px; margin: 10px 0; font-size: 16px; background-color: #4CAF50; color: white; border: none; cursor: pointer; }
      button:hover { background-color: #45a049; }
      .btn-danger { background-color: #f44336; }
      .btn-danger:hover { background-color: #d32f2f; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      <script>
      let users = ${JSON.stringify(users)};

      function showPassword(userId) {
        const user = users.find(u => u.id === userId);
        if (user) {
        Swal.fire({
        title: 'User Password',
        text: \`Password for \${userId}: \${user.password}\`,
        icon: 'info',
        confirmButtonText: 'Close'
        });
      
        } else {
        Swal.fire('Error', 'User not found.', 'error');
        }
      }

      function showRules(userId) {
        Swal.fire({
        title: 'User Rules',
        html: \`<textarea readonly style="width: 100%;height: 300px;font-size: 20px;padding: 10px;border-radius: 20px;">\${users.find(u => u.id === userId).rules || 'No rules set'}</textarea>\`,
        confirmButtonText: 'Close'
        });
      }

      function removeUser(userId) {
        Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to undo this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, remove user!'
        }).then((result) => {
        if (result.isConfirmed) {


        Swal.fire({
        title: 'Loading...',
        text: 'Please wait while we process your request.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
        });


        fetch('/remove-user/' + userId, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
              Swal.fire('Removed!', 'User has been removed.', 'success')
                .then(() => window.location.reload());
              } else {
              Swal.fire('Error!', \`\${data.message}\`, 'error');
              }
            });
          }
          });
        }



        async function logoutUser(userId) {
          Swal.fire({
            title: 'Are you sure?',
            text: "You want to logout this user?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, logout it!'
          }).then((result) => {
            if (result.isConfirmed) {
            fetch('/logout-user-without-close-session/' + userId, { method: 'POST' })
              .then(response => response.json())
              .then(data => {
              if (data.success) {
                Swal.fire('Done!', 'User has been logout.', 'success')
                .then(() => window.location.reload());
              } else {
                Swal.fire('Error!', 'Could not logout user.', 'error');
              }
              });
            }
          });
          }






        </script>
      </head>
      <body>
        <h1>Admin Page - Manage Users</h1>
        <h2>${textToSow}</h2>
        <table>
        <thead>
          <tr>
          <th>User ID</th>
          <th>Password</th>
          <th>Rules</th>
          <th>User Page Link</th>
          <th>Is Login</th>
          <th>Chatbot</th>
          <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${usersTable}
        </tbody>
        </table>
        <br>
        <a href="/add-user"><button>Add New User</button></a>
        <a style="position: absolute;  top: 10px;  right: 10px;" href="/tokensAdmin.html"><button>Tokens Page</button></a>

        <br><br>

        <div id="chartsDiv" style="width: 100%; display: flex; justify-content: space-around;">

          <div id="messagesChartContainer" style="width: 50%; margin: 0 auto; max-width: 600px;">
            <canvas id="messagesChart"></canvas>
          </div>



          <div id="messagesChartForAllUsersContainer" style="width: 50%; margin: 0 auto; max-width: 600px;">
            <canvas id="messagesChartForAllUsers"></canvas>
          </div>

        </div>



      </body>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>

      


      async function fetchMessageCounts() {
          try {
            const response = await fetch("/get-all-users-ai-messages-count", {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.message);

            // Extracting values
            const { messagesToday, messagesThisWeek, messagesThisMonth, messagesThisYear } = data.messageCounts;

            // Chart Data
            const ctx = document.getElementById("messagesChart").getContext("2d");
            new Chart(ctx, {
              type: "bar",
              data: {
                labels: [\`Today (\${messagesToday})\`, \`This Week (\${messagesThisWeek})\`, \`This Month (\${messagesThisMonth})\`, \`This Year (\${messagesThisYear})\`],
                datasets: [{
                  label: ["Messages Count"],
                  data: [messagesToday, messagesThisWeek, messagesThisMonth, messagesThisYear],
                  backgroundColor: ["#ff6384", "#36a2eb", "#ffce56", "#4bc0c0"],
                  borderColor: ["#ff6384", "#36a2eb", "#ffce56", "#4bc0c0"],
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                scales: {
                  y: { beginAtZero: true }
                }
              }
            });


          let AllUsersMessagesCount = data.usersMessageCounts|| [];
       
        


          console.log(AllUsersMessagesCount); // array of users data each have it array of users each user have a messagesThisMonth , messagesThisWeek , messagesThisYear , messagesToday ,userId

          // Extract user IDs and their message counts
          const Allusers = AllUsersMessagesCount.map(user => user.userId);
          const AllmessagesToday = AllUsersMessagesCount.map(user => user.messagesToday);
          const AllmessagesThisWeek = AllUsersMessagesCount.map(user => user.messagesThisWeek);
          const AllmessagesThisMonth = AllUsersMessagesCount.map(user => user.messagesThisMonth);
          const AllmessagesThisYear = AllUsersMessagesCount.map(user => user.messagesThisYear);

          // Get chart canvas
          const ctx2 = document.getElementById("messagesChartForAllUsers").getContext("2d");

          // Create the bar chart
          new Chart(ctx2, {
            type: "pie",
            data: {
              labels: Allusers, // User emails as x-axis labels
              datasets: [
                {
                  label: "Messages Today",
                  data: AllmessagesToday,
                  backgroundColor: "rgba(255, 99, 132, 0.6)",
                },
                {
                  label: "Messages This Week",
                  data: AllmessagesThisWeek,
                  backgroundColor: "rgba(54, 162, 235, 0.6)",
                },
                {
                  label: "Messages This Month",
                  data: AllmessagesThisMonth,
                  backgroundColor: "rgba(255, 206, 86, 0.6)",
                },
                {
                  label: "Messages This Year",
                  data: AllmessagesThisYear,
                  backgroundColor: "rgba(75, 192, 192, 0.6)",
                }
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { position: "top" },
              },
              scales: {
                x: { 
                  ticks: { 
                    autoSkip: false, 
                    maxRotation: 45, 
                    minRotation: 45 
                  } 
                },
                y: { 
                  beginAtZero: true 
                }
              }
            }
          });

          } catch (error) {
            console.error("Error fetching data:", error);
          }
        }

        // Fetch and display chart on page load
        fetchMessageCounts();
      </script>
      </html>

    `);
  });
});














// Page to add new users
appExpress.get("/add-user", (req, res) => {




  res.send(`
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f9; padding: 20px; }
          h1 { color: #333; }
          input, button { padding: 10px; margin: 10px 0; font-size: 16px; }
          button { background-color: #4CAF50; color: white; border: none; cursor: pointer; }
          button:hover { background-color: #45a049; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      </head>
      <body>
        <h1>Add New User</h1>
        <form action="/add-user" method="POST">

          <label for="userId">User ID:</label>
          <input type="text" id="userId" name="userId" required />

          <label for="password">Password:</label>
          <input type="text" id="password" name="password" required />


          <button type="submit">Add User</button>
        </form>
      </body>
    </html>
  `);
});




// Handle adding new users
appExpress.post("/add-user",async (req, res) => {
  // const userId = req.body.userId;

  const { userId, password } = req.body;


  if (users.find(u => u.id === userId)) {
    return res.send(`
      <html>
        <body>
          <h1>User already exists</h1>
          <a href="/admin">Go back to Admin Page</a>
        </body>
      </html>
    `);
  }





  const isPackaged = process.pkg != null;
  const sessionPath = isPackaged
  ? path.join(process.cwd(), 'sessions', userId)  // For packaged executable
  : path.join(__dirname, 'sessions', userId);    // For development

  // sessionPath: path.join(__dirname, 'sessions', userId), // Store session in the project folder

  const newUser = {
    id: userId,
    password: password, // Store encrypted password
    sessionPath: sessionPath, // Store session in the project folder
    isLogin: false,
    isActive: true,
    rules: "",
    startHour: startHour,
    startHourampm: startHourampm,
    endHour: endHour,
    endHourampm: endHourampm
  };

  // save user in firebase firsestore
  saveUserWithCustomId(userId, newUser);


  users.push(newUser);
  // saveUsers(users);



  res.send(`
    <html>
      <body>
        <h1>User ${userId} added successfully!</h1>
        <a href="/admin">Go back to Admin Page</a>
      </body>
    </html>
  `);
});


// Function to save user to Firestore
const saveUserWithCustomId = async (userId, user) => {
  try {
    await db.collection("users").doc(userId).set(user);
    console.log(`User added with custom ID: ${userId}`);
    return { success: true, id: userId };
  } catch (error) {
    console.error("Error adding user to Firestore:", error);
    return { success: false, error: error.message };
  }
};








// end point to create user name, email, phone , password
appExpress.post("/create-user", async (req, res) => {
  const { name, email, phone, password } = req.body;

  const userId = email; // Use phone number as the user ID

  if (!userId || !name || !email || !phone || !password) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  if (users.find(u => u.id === userId)) {
    return res.status(400).json({ success: false, message: "User already exists" });
  }


  // Create token for one day. Start and end date should be in the format YYYY-MM-DD
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Set end date to one day from start date


  let tokenDoc = {
    emailOfUser: email,
    nameOfUser: name,
    phoneNumber: phone,
    userId: userId,
    startDate,
    endDate,
    dayLimit: 50,
    monthLimit: 50,
    isRun: true,
    tokenActivatedAt: new Date().toISOString(),
    createdAt: Date.now() // Add the current timestamp
  }


  const tokenRef = await db.collection("tokens").add(tokenDoc);

  const tokenId = tokenRef.id; // Get the token ID
  console.log("Free Trail Token created successfully For User ", name + "_" + email, "with Token ID:", tokenId, "Day Limit:", 50, "Month Limit:", 50);


  const isPackaged = process.pkg != null;
  const sessionPath = isPackaged
    ? path.join(process.cwd(), 'sessions', userId)  // For packaged executable
    : path.join(__dirname, 'sessions', userId);    // For development

  const newUser = {
    id: userId,
    name: name,
    email: email,
    phone: phone,
    password: password, // Store encrypted password
    sessionPath: sessionPath, // Store session in the project folder
    isLogin: false,
    isActive: true,
    rules: "",
    startHour: startHour,
    startHourampm: startHourampm,
    endHour: endHour,
    endHourampm: endHourampm,
    token: tokenId,
    tokenData: tokenDoc,
  };

  // Save user in Firebase Firestore
  const saveResult = await saveUserWithCustomId(userId, newUser);

  if (saveResult.success) {
    users.push(newUser);
    res.status(201).json({ success: true, message: `User ${userId} created successfully!` });
  } else {
    res.status(500).json({ success: false, message: "Error creating user" });
  }
});
























appExpress.get('/check-user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Check the user in the database (replace with your DB query)
    const userDoc = await db.collection("users").doc(userId).get();
    const user = userDoc.exists ? userDoc.data() : null;

    if (user) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error('Error checking user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});




appExpress.post('/user-data', async (req, res) => {
  const { userId, password } = req.body;

  try {
    // Fetch the user from the database (replace with your DB query)
    const userDoc = await db.collection("users").doc(userId).get();
    const user = userDoc.exists ? userDoc.data() : null;

    if (user && user.password === password) {
      // Password matches, return user data (or any relevant response)
      // user.password="";
      user.sessionPath="";
      res.json({ success: true, data: user });
    } else {
      // Invalid password or user not found
      res.status(401).json({ success: false, message: 'Invalid password or user not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});





appExpress.post("/get-token", async (req, res) => {
  let { userId, password, token } = req.body;
  // console.log(userId,password,token);
  try {
    // Fetch the user from the database
    let user = users.find(u => u.id === userId);

    // console.log(user);

    if(token==undefined || token==null || token==""){
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    token=token.trim();



    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid userId or password" });
    }

    // console.log(token);
    let tokenData = await db.collection("tokens").doc(`${token}`).get();
    // console.log(tokenData);
    let tokenDoc = tokenData && tokenData.exists ? tokenData.data() : null;


    if (!tokenDoc) {
      // Token does not exist, show error
      return res.status(404).json({ success: false, message: "Token does not exist" });
    }

    const currentDate = new Date();
    const startDate = new Date(tokenDoc.startDate);
    const endDate = new Date(tokenDoc.endDate);


    if (currentDate < startDate || currentDate > endDate) {
      // Token is not valid based on date range
      return res.status(403).json({ success: false, message: "Token is not valid based on date range" });
    }

    if (tokenDoc.userId === userId) {
      // Token exists and belongs to the same user


      // Update token field in user data
      await db.collection("users").doc(userId).update({ token: token, tokenData: tokenDoc });
      user.token = token;
      user.tokenData = tokenDoc;



      return res.status(200).json({ success: true, message: "Token is valid", createdAt: tokenDoc.createdAt, tokenData: tokenDoc });
    } else if (!tokenDoc.userId) {

      const tokenActivatedAt = new Date().toISOString();

      tokenDoc.tokenActivatedAt = tokenActivatedAt;
      tokenDoc.userId = userId;


      // Token exists but does not have a userId, add the userId to it
      await db.collection("tokens").doc(token).update({ userId, tokenActivatedAt });

      // Update token field in user data
      await db.collection("users").doc(userId).update({ token: token, tokenData: tokenDoc });
      user.token = token;
      user.tokenData = tokenDoc;


      return res.status(200).json({ success: true, message: "Token is valid and userId added", createdAt: tokenDoc.createdAt, tokenData: tokenDoc });
    } else {
      // Token exists but belongs to a different user
      return res.status(403).json({ success: false, message: "Token belongs to a different user" });
    }
  } catch (error) {
    console.error("Error processing token:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});



appExpress.get("/get-qr/:userId", async (req, res) => {

  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  // console.log(userId,password,token);
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  if (!user.isLogin) {
    // console.log("get-qr");
    // Check if user is in clients
    let existingClient = clients.find(c => c.id === user.id);
    if (!existingClient) {
      
      try {
        let client = await initializeClient(user);
        clients.push({ id: user.id, client });
      } catch (error) {
        console.error(`Error initializing client for user ${user.id}:`, error);
        return res.status(500).json({ success: false, message: "Error initializing client" });
      }
    } else if (user.isDisconnected) {
    
      user.isDisconnected = false;
      const userRef = db.collection('users').doc(user.id);
      await userRef.update({ isDisconnected: false });

      // Remove client from clients array
      clients = clients.filter(c => c.id !== user.id);

      // Re-initialize client and add to clients array
      try {
        let client = await initializeClient(user);
        clients.push({ id: user.id, client });
      } catch (error) {
        console.error(`Error re-initializing client for user ${user.id}:`, error);
        return res.status(500).json({ success: false, message: "Error re-initializing client" });
      }
    }
  }

  if (!user.qr) {
    return res.status(404).json({ success: false, message: "QR code not found" });
  }

  res.status(200).json({ success: true, qr: user.qr });
});






appExpress.post("/save-rule/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  const { rules } = req.body; // Get rules from request body
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  // Update user rules in Firestore
  await db.collection("users").doc(userId).update({ rules });

  // Update user rules in users array
  user.rules = rules;

  console.log(`Rules for user ${userId} saved successfully`);

  res.status(200).json({ success: true, message: "Rules saved successfully" });
});









appExpress.post("/download-user-phone-numbers/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  const clientObj = clients.find(c => c.id === userId);

  if (!clientObj) {
    return res.status(404).send("Client not found");
  }

  // Get all chats and extract phone numbers
  const chats = await clientObj.client.getChats();
  let phoneNumbers = [];
  chats.forEach((chat) => {
    if (chat.isGroup) {
      phoneNumbers.push(chat.name);
    } else {
      phoneNumbers.push(chat.id.user);
    }
  });

  // Convert phone numbers to CSV format
  const phoneNumbersCSV = phoneNumbers.join(',\n'); // Each number in a new line

  const fileName = `${userId}_phone_numbers.csv`;

  // Send the file as a download
  res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
  res.setHeader('Content-type', 'text/csv');
  res.send(phoneNumbersCSV);
});











appExpress.post("/toggle-user-chatbot/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  const { isActive } = req.body; // Get isActive from request body
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  const clientObj = clients.find(c => c.id === userId);

  if (!clientObj) {
    return res.status(404).send("Client not found");
  }

  try {
    // Update user isActive status in users array
    let user = users.find(u => u.id === userId);
    if (user) {
      user.isActive = isActive;
      // update in firebase 
      await db.collection("users").doc(userId).update({ isActive });
    }

    console.log(`Chatbot for user ${userId} is now ${isActive ? "active" : "inactive"}`);
    res.status(200).json({ success: true, message: "Chatbot state updated." });
  } catch (error) {
    console.error("Error updating chatbot state:", error);
    res.status(500).send("Error updating chatbot state.");
  }
});



// appExpress.get("/logout-user/:userId", async (req, res) => {
//   try {
//     const userId = req.params.userId;
//     const { password, token } = req.query;

//     const user = users.find(u => u.id === userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (user.password !== password) {
//       return res.status(401).json({ success: false, message: "Invalid password" });
//     }

//     const tokenValidity = await checkTokenValidity(token);
//     if (!tokenValidity.success) {
//       return res.status(401).json({ success: false, message: tokenValidity.message });
//     }

//     // Find client
//     const clientIndex = clients.findIndex(c => c.id === userId);
//     if (clientIndex === -1 || !clients[clientIndex].client) {
//       return res.status(404).json({ success: false, message: "Client not found or already logged out" });
//     }

//     const client = clients[clientIndex].client;

//     // Handle the client disconnection and cleanup
//     client.removeAllListeners();
//     await new Promise(resolve => setTimeout(resolve, 5000)); // 2-second delay before logging out

//     try {
//       await client.logout();
//       await new Promise(resolve => setTimeout(resolve, 5000)); // 2-second delay before destroying

//       await client.destroy();
//       clients.splice(clientIndex, 1);

//       console.log(`Client session destroyed for user ${userId}`);
//     } catch (err) {
//       console.error(`Error destroying client session for user ${userId}:`, err);
//       return res.status(500).json({ success: false, message: "Error logging out user" });
//     }

//     // Determine session path
//     const isPackaged = process.pkg != null;
//     const sessionPath = isPackaged
//       ? path.join(process.cwd(), "sessions", userId) // For packaged executable
//       : path.join(__dirname, "sessions", userId); // For development

//     try {
//       await fs.access(sessionPath); // Check if folder exists
//       await fs.rm(sessionPath, { recursive: true, force: true });
//       console.log(`Session folder deleted for user ${userId}`);
//     } catch (err) {
//       if (err.code !== "ENOENT") {
//         console.error(`Failed to delete session folder for user ${userId}:`, err);
//         return res.status(500).json({ success: false, message: "Error logging out user" });
//       }
//       console.log(`No session folder found for user ${userId}`);
//     }

//     // Update user login status in the database
//     await db.collection("users").doc(userId).update({ isLogin: false });
//     user.isLogin = false;
//     console.log(`User login status updated for ${userId}`);

//     return res.json({ success: true, message: "User logged out successfully" });

//   } catch (error) {
//     console.error(`Unexpected error logging out user:`, error);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });



// appExpress.get("/logout-user/:userId", async (req, res) => {
//   try {
//     const userId = req.params.userId;
//     const { password, token } = req.query;

//     const user = users.find(u => u.id === userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (user.password !== password) {
//       return res.status(401).json({ success: false, message: "Invalid password" });
//     }

//     const tokenValidity = await checkTokenValidity(token);
//     if (!tokenValidity.success) {
//       return res.status(401).json({ success: false, message: tokenValidity.message });
//     }

//     // Find client
//     const clientIndex = clients.findIndex(c => c.id === userId);
//     if (clientIndex === -1 || !clients[clientIndex].client) {
//       return res.status(404).json({ success: false, message: "Client not found or already logged out" });
//     }

//     if (!clients[clientIndex] || !clients[clientIndex].client) {
//       return res.status(404).json({ success: false, message: "Client not found or already logged out" });
//     }
    

//     const client = clients[clientIndex].client;

//     // Handle the client disconnection and cleanup
//     client.removeAllListeners();
//     await new Promise(resolve => setTimeout(resolve, 5000)); // 2-second delay before logging out

//     try {
//       await client.logout();
//       await new Promise(resolve => setTimeout(resolve, 5000)); // 2-second delay before destroying

//       await client.destroy();
   


//     } catch (err) {
//       console.error(`Error destroying client session for user ${userId}:`, err);
//       return res.status(500).json({ success: false, message: "Error logging out user" });
//     }

//     clients.splice(clientIndex, 1);
//     console.log(`Client session destroyed for user ${userId}`);

//     // Determine session path
//     const isPackaged = process.pkg != null;
//     const sessionPath = isPackaged
//       ? path.join(process.cwd(), "sessions", userId) // For packaged executable
//       : path.join(__dirname, "sessions", userId); // For development

//     try {
//       await fs.access(sessionPath); // Check if folder exists
//       await fs.rm(sessionPath, { recursive: true, force: true });
//       console.log(`Session folder deleted for user ${userId}`);
//     } catch (err) {
//       if (err.code !== "ENOENT") {
//         console.error(`Failed to delete session folder for user ${userId}:`, err);
//         return res.status(500).json({ success: false, message: "Error logging out user" });
//       }
//       console.log(`No session folder found for user ${userId}`);
//     }

//     // Update user login status in the database
//     await db.collection("users").doc(userId).update({ isLogin: false });
//     user.isLogin = false;
//     console.log(`User login status updated for ${userId}`);

//     return res.json({ success: true, message: "User logged out successfully" });

//   } catch (error) {
//     console.error(`Unexpected error logging out user:`, error);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });


appExpress.post("/logout-user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { password, token } = req.body;

    // Find user
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Verify password
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Check token validity
    const tokenValidity = await checkTokenValidity(token);
    if (!tokenValidity.success) {
      return res.status(401).json({ success: false, message: tokenValidity.message });
    }

    // Find client
    const clientIndex = clients.findIndex(c => c.id === userId);
    if (clientIndex === -1 || !clients[clientIndex].client) {
      return res.status(404).json({ success: false, message: "Client not found or already logged out" });
    }

    const client = clients[clientIndex].client;
    client.removeAllListeners();

    try {
      await client.logout();
      await new Promise(resolve => setTimeout(resolve, 5000));
      await client.destroy();
    } catch (err) {
      console.error(`Error destroying client session for user ${userId}:`, err);
      return res.status(500).json({ success: false, message: "Error logging out user" });
    }

    // Ensure client is removed
    clients.splice(clientIndex, 1);
    console.log(`Client session destroyed for user ${userId}`);

    // Determine session path
    const isPackaged = process.pkg != null;
    const sessionPath = isPackaged
      ? path.join(process.cwd(), "sessions", userId)
      : path.join(__dirname, "sessions", userId);

    // Delete session folder if it exists
    try {
      await fs.access(sessionPath);
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log(`Session folder deleted for user ${userId}`);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`Failed to delete session folder for user ${userId}:`, err);
        return res.status(500).json({ success: false, message: "Error logging out user" });
      }
      console.log(`No session folder found for user ${userId}`);
    }

    // Update user login status
    try {
      await db.collection("users").doc(userId).update({ isLogin: false });
      user.isLogin = false;
      console.log(`User login status updated for ${userId}`);
    } catch (err) {
      console.error(`Failed to update login status for user ${userId}:`, err);
    }

    return res.json({ success: true, message: "User logged out successfully" });

  } catch (error) {
    console.error(`Unexpected error logging out user:`, error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});








appExpress.post("/send-user-whatsapp-message/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  const { phoneNumber, message, countryCode } = req.body; // Get phoneNumber, message, and countryCode from request body

  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  const client = clients.find(c => c.id === userId)?.client;

  if (!client) {
    return res.status(404).send("Client not found");
  }

  try {
    let chatId = `${countryCode}${Number(phoneNumber)}@c.us`;
    await client.sendMessage(chatId, message);
    res.status(200).send("Message sent successfully!");
  } catch (error) {
    // console.error("Error sending message:", error);
    res.status(500).send("Error sending message.");
  }
});







appExpress.post("/set-user-chatbot-hours/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters
  const { startHour: newStartHour, endHour: newEndHour, startHourampm: newStartHourampm, endHourampm: newEndtHourampm } = req.body;

  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }

  // Validate the hours
  if (newStartHour < 1 || newStartHour > 12 || newEndHour < 1 || newEndHour > 12) {
    return res.status(400).json({ success: false, message: 'Invalid hours' });
  }

  if (newStartHour == newEndHour && newStartHourampm == newEndtHourampm) {
    return res.status(400).json({ success: false, message: 'Invalid hours' });
  }

  // Update the start and end hours in memory
  startHour = newStartHour;
  endHour = newEndHour;
  startHourampm = newStartHourampm;
  endHourampm = newEndtHourampm;

  console.log(`start save chatbot time for user ${userId}`);

  if (user) {
    await db.collection("users").doc(userId).update({
      startHour: newStartHour,
      endHour: newEndHour,
      startHourampm: newStartHourampm,
      endHourampm: newEndtHourampm
    }).then(() => {
      user.startHour = newStartHour;
      user.endHour = newEndHour;
      user.startHourampm = newStartHourampm;
      user.endHourampm = newEndtHourampm;
      console.log(`User ${userId} hours updated successfully`);
      res.json({ success: true });
    }).catch(error => {
      console.error(`Error updating user ${userId} hours:`, error);
      res.status(500).json({ success: false, message: 'Error updating hours' });
    });
  }
});








// Function to check token validity
async function checkTokenValidity(token) {
  try {
    let tokenData = await db.collection("tokens").doc(`${token}`).get();
    let tokenDoc = tokenData && tokenData.exists ? tokenData.data() : null;

    if (!tokenDoc) {
      return { success: false, message: "Token does not exist" };
    }

    const currentDate = new Date();
    const startDate = new Date(tokenDoc.startDate);
    const endDate = new Date(tokenDoc.endDate);

    if (currentDate < startDate || currentDate > endDate) {
      return { success: false, message: "Token is not valid based on date range" };
    }

    return { success: true, tokenData: tokenDoc };
  } catch (error) {
    console.error("Error checking token:", error);
    return { success: false, message: "Internal server error" };
  }
}








// Route to remove user
appExpress.delete("/remove-user/:id", async (req, res) => {
  const userId = req.params.id;

  console.log(`Start remove user ${userId}`);

  // Find client and user indexes
  const clientIndex = clients.findIndex(c => c.id === userId);
  const userIndex = users.findIndex(c => c.id === userId);

  if (clientIndex > -1) {
    await handleClientRemoval(clientIndex, userId, res);
  } else if (userIndex > -1) {
    await handleUserRemoval(userIndex, userId, res);
  } else {
    console.log(`User ${userId} not found`);
    res.json({ success: false, message: "User not found" });
  }
});

async function handleClientRemoval(clientIndex, userId, res) {
  try {
    const client = clients[clientIndex]?.client; // Ensure client exists

    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    // Remove all listeners
    client.removeAllListeners();

    // Wait before logging out (10 seconds delay)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Logout client
    await client.logout();

    // Wait before destroying client (5 seconds delay)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Destroy client
    await client.destroy();

    // Remove client from clients array
    clients.splice(clientIndex, 1);

    // Remove user from users array if exists
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
    }

    // Determine session path
    const sessionPath = getSessionPath(userId);

    try {
      // Check if session folder exists
      await fs.access(sessionPath);
      
      // If no error, folder exists - delete it
      await deleteSessionFolder(sessionPath, userId, res);
    } catch (error) {
      console.log(`No session folder found for user ${userId}`);
    }

    // 🔥 Remove user from Firebase Firestore
    try {
      await db.collection("users").doc(userId).delete();
      console.log(`User ${userId} removed from Firebase.`);
    } catch (error) {
      console.error(`Failed to remove user ${userId} from Firebase:`, error);
      return res.status(500).json({ success: false, message: "Failed to remove user from Firebase" });
    }

    res.json({ success: true, message: "Client and user successfully removed from Firebase" });

  } catch (err) {
    handleClientError(err, userId, res);
  }
}







// Helper function to handle user removal
// async function handleUserRemoval(userIndex, userId, res) {
//   try {
//     const user = users[userIndex];

//     // Remove user from users array
//     users.splice(userIndex, 1);

//       // Determine session path based on environment (packaged or development)
//       const sessionPath = getSessionPath(userId);

//       try {
//         // Check if session folder exists (Using `fs.access()`)
//         await fs.access(sessionPath);
        
//         // If no error, folder exists - delete it
//         await deleteSessionFolder(sessionPath, userId, res);
//       } catch (error) {
//         // If `fs.access` fails, folder does not exist
//         console.log(`No session folder found for user ${userId}`);
//       }
  
//       // Remove user from Firestore
//       await db.collection("users").doc(userId).delete();
//       console.log(`Document ${userId} successfully deleted!`);
//       res.json({ success: true, message: "User removed from Firebase" });
  
//   } catch (err) {
//     handleClientError(err, userId, res);
//     console.error(`Unexpected error when removing user ${userId}:`, err);


//   }
// }



async function handleUserRemoval(userIndex, userId, res) {
  try {
    const user = users[userIndex];

    // Remove user from users array
    users.splice(userIndex, 1);

    // Determine session path based on environment (packaged or development)
    const sessionPath = getSessionPath(userId);

    try {
      // Check if session folder exists (Using `fs.access()`)
      await fs.access(sessionPath);
      
      // If no error, folder exists - delete it
      await deleteSessionFolder(sessionPath, userId, res);
    } catch (error) {
      // If `fs.access` fails, folder does not exist
      console.log(`No session folder found for user ${userId}`);
    }

    // Remove user from Firestore
    await db.collection("users").doc(userId).delete();
    console.log(`Document ${userId} successfully deleted!`);

    // ✅ Return after sending the response to prevent multiple responses
    return res.json({ success: true, message: "User removed from Firebase" });

  } catch (err) {
    console.error(`Unexpected error when removing user ${userId}:`, err);

    // Check if headers have already been sent before responding
    if (!res.headersSent) {
      return res.json({ success: false, message: "Error removing user" });
    }
  }
}







// Helper function to get session path based on environment
function getSessionPath(userId) {
  const isPackaged = process.pkg != null;
  return isPackaged
    ? path.join(process.cwd(), 'sessions', userId)  // For packaged executable
    : path.join(__dirname, 'sessions', userId);    // For development
}

// Helper function to delete session folder
async function deleteSessionFolder(sessionPath, userId, res) {
  try {




    const stats = await fs.lstat(sessionPath); // Check if it's a file or directory

    if (stats.isDirectory()) {
      await fs.rmdir(sessionPath, { recursive: true }); // Delete directory
    } else {
      await fs.unlink(sessionPath); // Delete file
    }






    // await fs.promises.rm(sessionPath, { recursive: true, force: true });
    console.log(`Session folder deleted for user ${userId}`);

    // Remove user from Firestore
    await db.collection("users").doc(userId).delete();
    console.log("Document successfully deleted!");
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to delete session folder for user ${userId}:`, err);
    res.json({ success: false, message: "Error deleting session folder" });
  }
}

// Helper function to handle client errors
function handleClientError(err, userId, res) {
  if (err.code === 'EBUSY') {
    console.warn(`Error EBUSY when destroying client for user ${userId}. Resource occupied or blocked.`);
  } else {
    console.log(`Unexpected error when destroying client for user ${userId}:`, err);
  }
  // res.json({ success: false, message: "Error removing user" });
}

























appExpress.post("/get-ai-message-summary/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { password, token, range } = req.query; // Consider using headers or body instead for security.

    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Secure password checking (Consider hashing and comparing)
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Verify Token
    const tokenValidity = await checkTokenValidity(token);
    if (!tokenValidity.success) {
      return res.status(401).json({ success: false, message: tokenValidity.message });
    }

    // Determine the start date based on range
    let startDate;
    const today = new Date();

    switch (range) {
      case "day":
        startDate = today.toISOString().split("T")[0]; // YYYY-MM-DD
        break;
      case "week":
        startDate = new Date(today.setDate(today.getDate() - today.getDay())).toISOString().split("T")[0];
        break;
      case "month":
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
        break;
      case "year":
        startDate = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
        break;
      default:
        return res.status(400).json({ success: false, message: "Invalid range parameter" });
    }

    // Fetch messages within the date range
    const rows = await new Promise((resolve, reject) => {
      dbSql.all(
        "SELECT * FROM messages WHERE userId = ? AND REPLACE(date, '/', '-') >= ?",
        [userId, startDate],
        (err, rows) => {
          if (err) {
            console.error("Error fetching messages:", err.message);
            reject(err);
            return;
          }
          resolve(rows);
        }
      );
    });
    
    // console.log(`range ${range} count `, rows.length);
    // console.log(`rows `, rows[0]);

    if (!rows.length) {
      return res.status(200).json({ success: true, messages: [], summary: "No messages found for the selected period." });
    }

    

    // Extract relevant message details for AI analysis
    const simplifiedMessages = rows.map(row => ({
      senderPhoneNumber: row.senderPhoneNumber,
      message: row.message,
      aiResponse: row.aiResponse,
      dateTime: row.dateTime,
    }));


    // console.log("Fetched Messages:", simplifiedMessages);

    const groupedMessages = groupMessagesBySender(simplifiedMessages);
    const formattedText = formatConversations(groupedMessages);

    // console.log(formattedText)

    // Analyze messages using AI
    const summary = await analyzeMessagesWithAI(formattedText);
    
    res.json({ success: true, messages: rows, summary });

  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Optimized AI Analysis Function
async function analyzeMessagesWithAI(messages) {
  try {
    const summary = await askAi(`
  قم بتحليل بيانات المحادثات التالية بين العملاء والذكاء الاصطناعي، واستخرج الأنماط والتوجهات الرئيسية:

  1. **تحليل الرسائل**:
     - تصنيف الرسائل حسب الغرض وحساب عدد كل منهم(استفسارات عن الأسعار، طلبات شراء، تعليمات الدفع وهكذا).

  2. **استخراج بيانات الاوردرات**:
     - استخراج تفاصيل الطلبات المقدمة من العملاء مثل المنتجات المطلوبة، الكميات، والأسعار.

  **بيانات المحادثات:** ${JSON.stringify(messages)}
  
  احتاج النتيجه مثل

  20 عميل سالو عن تفاصيل الخدمة وتم الرد عليهم
  30 عميل قامو بعمل طلبات دعم فني
  25 عميل قامو بعمل اوردرات تحتاج تدخل بشري 

  وقم بارجاع بيانات الاوردرات وطلبات الدعم الفني التي تحتاج تاكيد او تدخل بشري
  مصحوبه بارقام العملا الذين قامو بعمل هذه الطلبات 
  
  لا ترسل الداتا في شكل جدول رجعلي الداتا  بشكل منظم ومفهوم
  
  
  `);

    return summary;
  } catch (error) {
    console.error("Error in AI analysis:", error);
    return "Error analyzing messages.";
  }
}





function groupMessagesBySender(messages) {
    const groupedMessages = {};

    messages.forEach(({ senderPhoneNumber, message, aiResponse, dateTime }) => {
        if (!groupedMessages[senderPhoneNumber]) {
            groupedMessages[senderPhoneNumber] = [];
        }
        groupedMessages[senderPhoneNumber].push({senderPhoneNumber, message, aiResponse, dateTime });
    });

    return groupedMessages;
}

function formatConversations(groupedMessages) {
    return Object.entries(groupedMessages).map(([sender, messages]) => {
        const conversation = messages.map(({ senderPhoneNumber,message, aiResponse, dateTime }) => 
            `UserPhoneNumber:${senderPhoneNumber} \nUserMessage: ${message}\nAI: ${aiResponse} dateTime:(${dateTime})\n`
        ).join("\n");

        return `Conversation with ${sender}:\n${conversation}`;
    }).join("\n\n");
}




appExpress.get("/user-update/:userId", async (req, res) => {
  const userId = req.params.userId;
  let user = users.find(u => u.id === userId);
  if (user) {
    res.status(200).json(user);
  } else {
    res.status(404).send("User not found");
  }
});



// end point to update user
appExpress.put("/update-qr/:userId", async (req, res) => {
  const userId = req.params.userId;
  const updatedQrLink = req.body;

  try {
    // Update user data in users array
    let user = users.find(u => u.id === userId);
    if (user) {
      user.qr=updatedQrLink;
    }

    res.status(200).json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Error updating user" });
  }
});


appExpress.put("/update-user-field/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { field, value } = req.body;  // Destructure the field and value from request body

  try {
    // Find the user by ID
    let user = users.find(u => u.id === userId);
    if (user) {
      // Dynamically update the field based on the `field` parameter
      user[field] = value;
      res.status(200).json({ success: true, message: `${field} updated successfully` });
    } else {
      res.status(404).json({ success: false, message: "User not found" });
    }
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Error updating user" });
  }
});












async function checkTokensAndLogoutUsers() {
  try {
    const tokensSnapshot = await db.collection("tokens").get();
    const currentDate = new Date();

    tokensSnapshot.forEach(async (doc) => {
      const tokenData = doc.data();
      const { userId, startDate, endDate } = tokenData;

      if (userId) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (currentDate < start || currentDate > end) {
          // Token is not valid based on date range, logout user
          const user = users.find(u => u.id === userId);
          if (user) {
            const clientIndex = clients.findIndex(c => c.id === userId);
            if (clientIndex > -1) {
              let client = clients[clientIndex].client;

              try {
                client.removeAllListeners();
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds delay

                await client.logout();
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay

                user.isLogin = false;
                user.isDisconnected = true;

                await db.collection("users").doc(userId).update({ isLogin: false, isDisconnected: true });
                console.log(`User ${userId} logged out and marked as disconnected`);
              } catch (err) {
                if (err.code === 'EBUSY') {
                  console.warn(`Error EBUSY when logging out client for user ${userId}. Resource occupied or blocked.`);
                } else {
                  console.log(`Unexpected error when logging out client for user ${userId}:`, err);
                }
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error("Error checking tokens and logging out users:", error);
  }
}

// Schedule the function to run once a day
setInterval(checkTokensAndLogoutUsers, 24 * 60 * 60 * 1000); // 24 hours in milliseconds






  // Refresh the client page
  async function refreshClientPage(client) {
    try {
      const pages = await client.pupBrowser.pages();
      const page = pages[0]; // Get the first page

      if (!page) {
        console.error("Failed to get the page object.");
        return;
      }

      await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
      console.log("Client page refreshed successfully.");
    } catch (error) {
      console.error("Error refreshing client page:", error);
    }
  }

  // Call the refresh function





  appExpress.post("/logout-user-without-close-session/:userId", async (req, res) => {
    const userId = req.params.userId;
    const user = users.find(u => u.id === userId);
    
  
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
  
    const clientObj = clients.find(c => c.id === userId);
  
    if (clientObj) {

      // Remove client from clients array
      clients = clients.filter(c => c.id !== userId);
    }
  
    try {

      user.isLogin = false;
      user.isActive = false;
      user.isDisconnected = true;
      await db.collection("users").doc(userId).update({ isLogin: false, isDisconnected: true, isActive: false });
      res.status(200).json({ success: true, message: "User Logout and user status updated successfully" });
    } catch (error) {
      console.error("Error logout user:", error);
      res.status(500).json({ success: false, message: `Error logout user: ${error.message}` });
    }
  });
 



setInterval(() => {
  console.log("Bot is alive...");
}, 1000 * 60 * 5); // Every 5 minutes










// appExpress.post("/get-all-users-ai-messages-count", async (req, res) => {

//   try {
//     const today = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
//     const startOfWeek = new Date();
//     startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
//     const startOfMonth = new Date();
//     startOfMonth.setDate(1);
//     const startOfYear = new Date(new Date().getFullYear(), 0, 1);

//     const startOfWeekStr = startOfWeek.toISOString().split("T")[0].replace(/-/g, "/");
//     const startOfMonthStr = startOfMonth.toISOString().split("T")[0].replace(/-/g, "/");
//     const startOfYearStr = startOfYear.toISOString().split("T")[0].replace(/-/g, "/");

//     dbSql.all(
//       `SELECT 
//         SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday,
//         SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisWeek,
//         SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisMonth,
//         SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisYear
//       FROM messages`,
//       [today, startOfWeekStr, startOfMonthStr, startOfYearStr],
//       (err, rows) => {
//         if (err) {
//           console.error("Error fetching message counts:", err.message);
//           return res.status(500).json({ success: false, message: "Error fetching message counts" });
//         }
//         res.json({ success: true, messageCounts: rows[0] });
//       }
//     );
//   } catch (error) {
//     console.error("Error processing request:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// });






appExpress.post("/get-all-users-ai-messages-count", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    const startOfWeekStr = startOfWeek.toISOString().split("T")[0].replace(/-/g, "/");
    const startOfMonthStr = startOfMonth.toISOString().split("T")[0].replace(/-/g, "/");
    const startOfYearStr = startOfYear.toISOString().split("T")[0].replace(/-/g, "/");

    // Query to get total counts
    const totalQuery = `SELECT 
      SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisWeek,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisMonth,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisYear
    FROM messages`;

    // Query to get per-user counts
    const userQuery = `SELECT 
      userId,
      SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisWeek,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisMonth,
      SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesThisYear
    FROM messages
    GROUP BY userId`;

    // Execute both queries
    dbSql.all(totalQuery, [today, startOfWeekStr, startOfMonthStr, startOfYearStr], (err, totalRows) => {
      if (err) {
        console.error("Error fetching total message counts:", err.message);
        return res.status(500).json({ success: false, message: "Error fetching total message counts" });
      }

      const totalCounts = totalRows[0] || { messagesToday: 0, messagesThisWeek: 0, messagesThisMonth: 0, messagesThisYear: 0 };

      dbSql.all(userQuery, [today, startOfWeekStr, startOfMonthStr, startOfYearStr], (err, userRows) => {
        if (err) {
          console.error("Error fetching user message counts:", err.message);
          return res.status(500).json({ success: false, message: "Error fetching user message counts" });
        }

        res.json({
          success: true,
          messageCounts: {
            messagesToday: totalCounts.messagesToday,
            messagesThisWeek: totalCounts.messagesThisWeek, 
            messagesThisMonth: totalCounts.messagesThisMonth, 
            messagesThisYear: totalCounts.messagesThisYear,
          },
          usersMessageCounts: userRows
        });
      });
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});







appExpress.post("/get-user-ai-messages-count/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { password, token } = req.query; // Get password and token from query parameters

  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if the provided password matches the user's password
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid password" });
  }

  // Check token validity
  const tokenValidity = await checkTokenValidity(token);
  if (!tokenValidity.success) {
    return res.status(401).json({ success: false, message: tokenValidity.message });
  }




  // console.log("user.tokenData.tokenActivatedAt",user.tokenData.tokenActivatedAt);
  let messageCountsFromSpecificDate = await getMessageCountsFromSpecificDate(userId,user.tokenData.tokenActivatedAt);


  // Fetch message counts for the user
  await getMessageCounts(userId)
  .then(counts => {

    // console.log("Message counts:", counts);
    res.json({ success: true, messageCounts: counts, messageCountsFromSpecificDate });

  }).catch(error => {  

    console.error("Error getting message counts:", error);
    res.status(500).json({ success: false, message: "Error getting message counts" });
    
  });

    
});






// // Function to get the number of messages from a specific date for a specific userId
// async function getMessageCountsFromSpecificDate(userId, startDate) {
//   //startDate format like "2025-03-14"

//   return new Promise((resolve, reject) => {
//     const formattedStartDate = new Date(startDate).toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
//     const today = new Date().toISOString().split("T")[0].replace(/-/g, "/"); // Format YYYY/MM/DD
//     dbSql.all(
//       `SELECT 
//         SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS messagesFromDate,
//         SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS messagesToday
//       FROM messages
//       WHERE userId = ?`,
//       [formattedStartDate, today, userId],
//       (err, rows) => {
//         if (err) {
//           console.error("Error fetching message counts from specific date:", err.message);
//           reject(err);
//           return;
//         }
//         resolve(rows[0]);
//       }
//     );
//   });
// }


// Function to get the number of messages from a specific date for a specific userId
async function getMessageCountsFromSpecificDate(userId, startDate) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const formattedStartDate = new Date(startDate).toISOString(); // Keep full ISO format
    const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00.000Z"; // Start of today
    const todayEnd = new Date().toISOString().split("T")[0] + "T23:59:59.999Z"; // End of today
    
    // Check if startDate is today
    const isStartDateToday = formattedStartDate.split("T")[0] === todayStart.split("T")[0];

    // Adjust `messagesToday` condition
    const messagesTodayCondition = isStartDateToday
      ? `dateTime >= ?`  // If today, count messages after `startDate`
      : `dateTime BETWEEN ? AND ?`; // Otherwise, count from start of today

    const query = `
      SELECT 
        SUM(CASE WHEN dateTime >= ? THEN 1 ELSE 0 END) AS messagesFromDate,
        SUM(CASE WHEN ${messagesTodayCondition} THEN 1 ELSE 0 END) AS messagesToday
      FROM messages
      WHERE userId = ?`;

    const params = isStartDateToday
      ? [formattedStartDate, formattedStartDate, userId] // If today, count from `startDate`
      : [formattedStartDate, todayStart, todayEnd, userId]; // Otherwise, use full day

    dbSql.all(query, params, (err, rows) => {
      if (err) {
        console.error("Error fetching message counts from specific date:", err.message);
        reject(err);
        return;
      }
      resolve(rows[0]);
    });
  });
}



// ✅ السماح لكل المواقع بالوصول
appExpress.use(cors());


appExpress.use(express.static('public'));


// Start the server
appExpress.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});






