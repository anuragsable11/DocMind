const questionInput =
    document.getElementById("question");

const askButton =
    document.getElementById("ask-button");

const chatMessages =
    document.getElementById("chat-messages");

const pdfFile =
    document.getElementById("pdf-file");

const uploadStatus =
    document.getElementById("upload-status");


// Stores the currently selected document
let currentDocumentId = null;


/* =========================================
   PDF UPLOAD
========================================= */

async function uploadPDF() {

    const file = pdfFile.files[0];

    if (!file) {
        return;
    }


    // Check PDF
    if (file.type !== "application/pdf") {

        uploadStatus.textContent =
            "❌ Please select a PDF file.";

        return;
    }


    uploadStatus.textContent =
        "Uploading and processing...";


    const formData = new FormData();

    formData.append("file", file);


    try {

        const response = await fetch(
            "/upload",
            {
                method: "POST",
                body: formData
            }
        );


        if (!response.ok) {
            throw new Error("Upload failed");
        }


        const data = await response.json();


        // Save document ID
        currentDocumentId =
            data.document_id;


        uploadStatus.textContent =
            `✓ ${data.filename} — ${data.chunks} chunks`;


        console.log(
            "Document ID:",
            currentDocumentId
        );


        // Add message to chat
        addMessage(
            "assistant",
            `Your document "${data.filename}" is ready. Ask me anything about it.`
        );


    } catch (error) {

        console.error(error);


        uploadStatus.textContent =
            "❌ Upload failed";


        addMessage(
            "assistant",
            "Something went wrong while uploading the PDF."
        );
    }
}


/* =========================================
   ASK QUESTION
========================================= */

async function askQuestion() {

    const question =
        questionInput.value.trim();


    if (!question) {
        return;
    }


    // Make sure a PDF is uploaded
    if (!currentDocumentId) {

        addMessage(
            "assistant",
            "Please upload a PDF first."
        );

        return;
    }


    // Show user's question
    addMessage(
        "user",
        question
    );


    // Clear input
    questionInput.value = "";


    // Disable button
    askButton.disabled = true;

    askButton.textContent =
        "Thinking...";


    // Loading message
    const loadingMessage =
        addMessage(
            "assistant",
            "Thinking...",
            true
        );


    try {

        const response = await fetch(
            "/chat",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    question: question,

                    document_id:
                        currentDocumentId

                })
            }
        );


        if (!response.ok) {
            throw new Error(
                "Server error"
            );
        }


        const data =
            await response.json();


        // Remove loading message
        loadingMessage.remove();


        // Display answer
        addMessage(
            "assistant",
            data.answer,
            false,
            data.sources
        );


    } catch (error) {

        console.error(error);


        loadingMessage.remove();


        addMessage(
            "assistant",
            "Something went wrong while contacting DocMind."
        );
    }


    // Enable button
    askButton.disabled = false;

    askButton.textContent =
        "Ask";
}


/* =========================================
   ADD MESSAGE
========================================= */

function addMessage(
    type,
    text,
    loading = false,
    sources = []
) {

    const message =
        document.createElement("div");


    message.className =
        `message ${
            type === "user"
                ? "user-message"
                : "assistant-message"
        }`;


    const avatar =
        type === "user"
            ? "👤"
            : "🧠";


    let sourcesHTML = "";


    if (
        sources &&
        sources.length > 0
    ) {

        sourcesHTML = `
            <div class="sources">
                Sources:
                ${sources
                    .map(
                        page =>
                            `Page ${page}`
                    )
                    .join(", ")}
            </div>
        `;
    }


    message.innerHTML = `

        <div class="avatar">
            ${avatar}
        </div>

        <div class="message-content">

            <div class="message-name">
                ${
                    type === "user"
                        ? "You"
                        : "DocMind"
                }
            </div>

            <div class="bubble ${
                loading
                    ? "loading"
                    : ""
            }">
                ${text}
            </div>

            ${sourcesHTML}

        </div>
    `;


    chatMessages.appendChild(
        message
    );


    // Scroll to latest message
    message.scrollIntoView({
        behavior: "smooth"
    });


    return message;
}


/* =========================================
   EVENTS
========================================= */

// PDF selected
pdfFile.addEventListener(
    "change",
    uploadPDF
);


// Ask button
askButton.addEventListener(
    "click",
    askQuestion
);


// Enter key
questionInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            askQuestion();
        }
    }
);