import express from 'express';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({extended:true}));

const pool = mysql.createPool({
    host: "qn66usrj1lwdk1cc.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: process.env.DB_USERNAME,
    password: process.env.DB_PWD,
    database: "qpnkqmddnq4cb6wq",
    connectionLimit: 10,
    waitForConnections: true
});

app.set('trust proxy', 1)
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}))

app.get("/", async (req, res) => { 
    res.render("login.ejs");
});

app.post('/loginProcess', async(req, res) => {
    let{username,password}=req.body;
    let hashedPassword="";
    let sql=`SELECT * FROM admin WHERE username=?`;
    const [rows] = await pool.query(sql, [username]);
    if(rows.length > 0){
        hashedPassword = rows[0].password;
    }
    const isMatch = await bcrypt.compare(password, hashedPassword);
    if(isMatch){
        req.session.username = rows[0].username;
        req.session.fullName = rows[0].firstName + " " + rows[0].lastName;
        req.session.authenticated = true;
        res.render("welcome.ejs", {fullName: req.session.fullName});
    }else{
        let loginError = "Invalid username or password! Try again.";
        res.render("login.ejs", {loginError: loginError});
    }
});

app.get("/welcome", isAuthenticated, (req, res) => {
    res.render("welcome.ejs", {fullName: req.session.fullName});
});

app.get("/profile", isAuthenticated, async (req, res) => {
    const [rows] = await pool.query(`
        SELECT firstName, lastName, username
        FROM admin
        WHERE username = ?
    `, [req.session.username]);

    res.render("profile.ejs", { admin: rows[0] });
});

app.get("/setting", isAuthenticated, async (req, res) => {
    const [admins] = await pool.query(`
        SELECT adminId, firstName, lastName, username 
        FROM admin
        ORDER BY lastName, firstName
    `);

    res.render("setting.ejs", { admins });
});

app.post("/addAdmin", isAuthenticated, async (req, res) => {
    let { firstName, lastName, username, password } = req.body;
    let hashed = await bcrypt.hash(password, 10);

    await pool.query(`
        INSERT INTO admin (firstName, lastName, username, password)
        VALUES (?, ?, ?, ?)
    `, [firstName, lastName, username, hashed]);

    res.redirect("/setting");
});

app.post("/deleteAdmin/:id", isAuthenticated, async (req, res) => {
    let id = req.params.id;
    await pool.query(`DELETE FROM admin WHERE adminId = ?`, [id]);
    res.redirect("/setting");
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

app.get("/addAuthor", isAuthenticated, (req, res) => {
    res.render("addAuthor.ejs");
});

app.post("/addAuthor", isAuthenticated, async (req, res) => {
    let { firstName, lastName, country, profession, dob, dod, bio, sex, portrait } = req.body;

    let sql = `INSERT INTO authors
               (firstName, lastName, country, profession, dob, dod, biography, sex, portrait)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await pool.query(sql, [firstName, lastName, country, profession, dob, dod, bio, sex, portrait]);

    res.render("addAuthor.ejs", { success: "Author added successfully!" });
});

app.get("/addQuote", isAuthenticated, async (req, res) => {
    const [authors] = await pool.query(`SELECT authorId, CONCAT(firstName, ' ', lastName) AS name 
                                        FROM authors
                                        ORDER BY lastName, firstName`);
    const [categories] = await pool.query(`SELECT DISTINCT category 
                                           FROM quotes 
                                           ORDER BY category`);

    res.render("addQuote.ejs", {authors, categories});
});

app.post("/addQuote", isAuthenticated, async (req, res) => {
    let { quote, authorId, category } = req.body;

    let sql = `INSERT INTO quotes (quote, authorId, category) VALUES (?, ?, ?)`;
    await pool.query(sql, [quote, authorId, category]);

    const [authors] = await pool.query(`SELECT authorId, CONCAT(firstName,' ',lastName) AS name FROM authors ORDER BY lastName`);
    const [categories] = await pool.query(`SELECT DISTINCT category FROM quotes ORDER BY category`);

    res.render("addQuote.ejs", { authors, categories, success: "Quote added successfully!" });
});

app.get("/deleteAuthor", isAuthenticated, async (req, res) => {
    const [authors] = await pool.query(`
        SELECT authorId, firstName, lastName, country, profession
        FROM authors
        ORDER BY lastName, firstName
    `);
    res.render("deleteAuthor.ejs", { authors });
});

app.post("/deleteAuthor/:id", isAuthenticated, async (req, res) => {
    let id = req.params.id;
    await pool.query(`DELETE FROM authors WHERE authorId = ?`, [id]);
    res.redirect("/deleteAuthor");
});

app.get("/deleteQuote", isAuthenticated, async (req, res) => {
    const [quotes] = await pool.query(`
        SELECT q.quoteId, q.quote, a.firstName, a.lastName
        FROM quotes q
        JOIN authors a ON q.authorId = a.authorId
        ORDER BY a.lastName, a.firstName
    `);
    res.render("deleteQuote.ejs", { quotes });
});

app.post("/deleteQuote/:id", isAuthenticated, async (req, res) => {
    let id = req.params.id;
    await pool.query(`DELETE FROM quotes WHERE quoteId = ?`, [id]);
    res.redirect("/deleteQuote");
});

app.get('/authors', isAuthenticated, async (req, res) => {
    let sql = `SELECT authorId, firstName, lastName
               FROM authors
               ORDER BY lastName, firstName`;
    const [authors] = await pool.query(sql);
    res.render('authors.ejs', { authors });
});

app.get('/quotes', isAuthenticated, async (req, res) => {
    let sql = `SELECT quoteId, quote
               FROM quotes
               ORDER BY quote`;
    const [quotes] = await pool.query(sql);
    res.render('quotes.ejs', { quotes });
});

app.get('/updateAuthor', isAuthenticated, async (req, res) => {
   let authorId = req.query.authorId;
   let sql = `SELECT *, DATE_FORMAT(dob, '%Y-%m-%d') ISOdob, DATE_FORMAT(dod, '%Y-%m-%d') ISOdod
              FROM authors
              WHERE authorId = ?`;
   const [authorInfo] = await pool.query(sql, [authorId]); 
   res.render('updateAuthor.ejs', {authorInfo});
});

app.post('/updateAuthor', isAuthenticated, async (req, res) => {
   let { firstName, lastName, dob, dod, sex, bio, profession, country, portrait, authorId } = req.body;

   let sql = `UPDATE authors
              SET firstName=?, lastName=?, dob=?, dod=?, sex=?, biography=?, profession=?, country=?, portrait=?
              WHERE authorId=?`;

   await pool.query(sql, [firstName, lastName, dob, dod, sex, bio, profession, country, portrait, authorId]);

   const [authorInfo] = await pool.query(
       `SELECT *, DATE_FORMAT(dob,'%Y-%m-%d') ISOdob, DATE_FORMAT(dod,'%Y-%m-%d') ISOdod FROM authors WHERE authorId=?`,
       [authorId]
   );

   res.render("updateAuthor.ejs", { authorInfo, success: "Author updated successfully!" });
});

app.get('/updateQuote', isAuthenticated, async(req, res) => {
   let quoteId = req.query.quoteId;

   const [quoteInfo] = await pool.query(`SELECT * FROM quotes WHERE quoteId = ?`, [quoteId]);              
   const [authorList] = await pool.query(`SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`);              

   res.render('updateQuote.ejs', {quoteInfo, authorList});
});

app.post('/updateQuote', isAuthenticated, async (req, res) => {
    let { quoteId, quote, category, authorId } = req.body;

    let sql = `UPDATE quotes
               SET quote=?, category=?, authorId=?
               WHERE quoteId=?`;

    await pool.query(sql, [quote, category, authorId, quoteId]);

    const [quoteInfo] = await pool.query(`SELECT * FROM quotes WHERE quoteId=?`, [quoteId]);
    const [authorList] = await pool.query(`SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`);

    res.render("updateQuote.ejs", { quoteInfo, authorList, success: "Quote updated successfully!" });
});

app.get("/dbTest", async(req, res) => {
   try {
        const [rows] = await pool.query("SELECT CURDATE()");
        res.send(rows);
    } catch (err) {
        res.status(500).send("Database error!");
    }
});

function isAuthenticated(req, res, next){
    if(req.session.authenticated){
        next();
    }else{
        res.redirect("/");
    }
}

app.listen(3000, ()=>{
    console.log("Express server running")
})