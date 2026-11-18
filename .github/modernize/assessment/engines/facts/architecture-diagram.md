# Architecture Diagram

Fredo is a desktop companion application with a React interface, an Electron host, and a local FastAPI service backed by SQLite. The diagrams show the app startup path and the main greeting, chat, and task workflows; no browser-extension source files are present in this workspace.

## Application Architecture

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart TD
    Start(("Start Fredo"))
    Lock(("Single instance lock acquired?"))
    Exit["Quit duplicate instance"]
    BackendCheck["Check backend health"]
    BackendReady(("Backend already running?"))
    PythonFound(("Backend virtual environment found?"))
    StartBackend["Start Uvicorn on loopback"]
    NoBackend["Continue without backend"]
    Window["Create Electron window and tray"]
    Renderer["Load React renderer"]
    Greeting["Request greeting"]
    Retry(("Greeting request succeeds?"))
    Attempts(("Retries remaining?"))
    GreetBubble["Show greeting in speech bubble"]
    OfflineBubble["Show backend error bubble"]
    Choice(("User action"))
    LocalAction["Toggle character state or open panel"]
    ChatInput["Enter chat message"]
    ChatValid(("Message is not empty?"))
    MessageRequest["POST message to FastAPI"]
    MessageSave["Save message and return fixed reply"]
    GreetingAPI["Handle greeting request"]
    TaskAPI["Handle task request"]
    GreetingBuilder["Build greeting from pending tasks"]
    Repository["Read or update records"]
    TaskPanel["Open task panel"]
    LoadTasks["GET pending tasks"]
    TaskChoice(("Task action"))
    AddValid(("Task title is not empty?"))
    AddTask["POST new task"]
    CompleteTask["POST task completion"]
    DeleteTask["DELETE task"]
    Refresh["Reload pending tasks"]
    ReturnUI["Update UI and show feedback"]
    Stop(("Quit Fredo"))

    subgraph Desktop["Electron desktop host"]
        Lock
        Exit
        BackendCheck
        BackendReady
        PythonFound
        StartBackend
        NoBackend
        Window
        Stop
    end
    subgraph Client["React renderer"]
        Renderer
        Greeting
        Retry
        Attempts
        GreetBubble
        OfflineBubble
        Choice
        LocalAction
        ChatInput
        ChatValid
        MessageRequest
        TaskPanel
        LoadTasks
        TaskChoice
        AddValid
        AddTask
        CompleteTask
        DeleteTask
        Refresh
        ReturnUI
    end
    subgraph Service["FastAPI service"]
        MessageSave
        GreetingAPI
        TaskAPI
        GreetingBuilder
        Repository
    end
    subgraph Storage["Local persistence"]
        DB[("SQLite messages and tasks")]
    end

    Start --> Lock
    Lock -->|"no"| Exit
    Lock -->|"yes"| BackendCheck
    BackendCheck --> BackendReady
    BackendReady -->|"yes"| Window
    BackendReady -->|"no"| PythonFound
    PythonFound -->|"yes"| StartBackend
    PythonFound -->|"no"| NoBackend
    StartBackend --> Window
    NoBackend --> Window
    Window --> Renderer
    Renderer --> Greeting
    Retry -->|"yes"| GreetBubble
    Retry -->|"no"| Attempts
    Attempts -->|"yes, wait one second"| Greeting
    Attempts -->|"no"| OfflineBubble
    Greeting --> GreetingAPI
    GreetingAPI -->|"load pending tasks"| Repository
    Repository -->|"query tasks"| DB
    DB -->|"pending task data"| Repository
    Repository -->|"pending task data"| GreetingBuilder
    GreetingBuilder --> GreetingAPI
    GreetingAPI --> Retry
    GreetBubble --> Choice
    OfflineBubble --> Choice
    Choice -->|"character click"| LocalAction
    Choice -->|"talk"| ChatInput
    Choice -->|"tasks"| TaskPanel
    ChatInput --> ChatValid
    ChatValid -->|"no"| ReturnUI
    ChatValid -->|"yes"| MessageRequest
    MessageRequest --> MessageSave
    MessageSave -->|"persist message"| DB
    MessageSave -->|"reply"| ReturnUI
    TaskPanel --> LoadTasks
    LoadTasks --> TaskAPI
    TaskAPI -->|"read or mutate task"| Repository
    Repository -->|"task result"| TaskAPI
    TaskAPI -->|"pending task list"| TaskChoice
    TaskChoice -->|"add"| AddValid
    TaskChoice -->|"complete"| CompleteTask
    TaskChoice -->|"delete"| DeleteTask
    AddValid -->|"no"| ReturnUI
    AddValid -->|"yes"| AddTask
    AddTask --> TaskAPI
    CompleteTask --> TaskAPI
    DeleteTask --> TaskAPI
    Repository -->|"commit changes"| DB
    DB -->|"stored task data"| Repository
    Repository -->|"operation result"| TaskAPI
    TaskAPI -->|"operation succeeded"| Refresh
    Refresh --> TaskAPI
    Refresh --> ReturnUI
    LocalAction --> Choice
    ReturnUI --> Choice
    Choice -->|"quit"| Stop
```

### Technology Stack Summary

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Desktop host | Electron | 45.3.0 | Window, tray, process lifecycle, and preload bridge |
| Renderer | React | 19.3.1 | Fredo character, chat, and task interface |
| Renderer language | TypeScript | 6.0.3 | UI and API client implementation |
| Frontend tooling | Vite | 8.3.6 | Renderer development server and production build |
| Backend | Python and FastAPI | FastAPI 0.162.4 | Local HTTP API and request validation |
| ORM | SQLAlchemy | 2.1.9 | Database models and persistence |
| Data store | SQLite | Not pinned | Local message and task storage |

### Data Storage & External Services

The backend uses the local `BACKEND/fredo.db` SQLite database for messages and tasks through SQLAlchemy. The desktop renderer calls the FastAPI service at `127.0.0.1:8000`; the Electron host checks `/health` and starts Uvicorn when needed. The renderer is served by Vite at `127.0.0.1:5173` in the current configuration. No external APIs, caches, or message brokers were found.

### Key Architectural Decisions

- The Electron main process owns the app lifecycle and starts the Python backend when its virtual environment is available.
- The React renderer communicates with the backend over HTTP; Electron exposes only a window-resize API through the preload bridge.
- FastAPI routes delegate database operations to a repository layer, which uses SQLAlchemy models and SQLite.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
```mermaid
flowchart LR
    subgraph ElectronLayer["Electron host"]
        cMain["Electron main process"]
        cPreload["Preload bridge"]
    end
    subgraph PresentationLayer["React presentation"]
        cEntry["Renderer entry point"]
        cApp["App"]
        cCharacter["Character"]
        cTaskPanel["TaskPanel"]
        cApi["API client"]
    end
    subgraph BackendLayer["FastAPI backend"]
        cFastAPI["FastAPI routes"]
        cGreeting["Greeting builder"]
        cSchemas["Pydantic schemas"]
        cRepository["Repository"]
    end
    subgraph PersistenceLayer["Persistence"]
        cModels["SQLAlchemy models"]
        cDatabase["Database session and engine"]
        cSQLite[("SQLite database")]
    end

    cMain -->|"loads renderer"| cEntry
    cMain -->|"starts and checks"| cFastAPI
    cMain -->|"sends resize IPC"| cPreload
    cPreload -->|"exposes resize API"| cApp
    cEntry -->|"renders"| cApp
    cApp -->|"shows"| cCharacter
    cApp -->|"opens"| cTaskPanel
    cApp -->|"requests greeting and chat"| cFastAPI
    cTaskPanel -->|"task operations"| cApi
    cApi -->|"HTTP requests"| cFastAPI
    cFastAPI -->|"validates requests"| cSchemas
    cFastAPI -->|"builds greeting"| cGreeting
    cFastAPI -->|"reads and writes"| cRepository
    cGreeting -->|"uses pending tasks"| cRepository
    cRepository -->|"queries and updates"| cModels
    cModels -->|"uses session"| cDatabase
    cDatabase -->|"SQLite connection"| cSQLite
```

### Component Inventory

| Component | Layer | Type | Responsibility |
|---|---|---|---|
| Electron main process | Desktop host | Electron main process | Enforces a single instance, manages the window and tray, and starts or stops the backend |
| Preload bridge | Desktop host | Context bridge | Exposes a constrained window-resize call to the renderer |
| Renderer entry point | React presentation | React bootstrap | Mounts the React application |
| App | React presentation | React component | Handles greeting, chat, character state, and panel visibility |
| Character | React presentation | React component | Renders the interactive Fredo character |
| TaskPanel | React presentation | React component | Lists, creates, completes, and deletes tasks |
| API client | React presentation | HTTP client | Sends task requests to the local backend |
| FastAPI routes | Backend | API routes | Handles health, message, greeting, and task list, create, update, completion, and delete requests |
| Greeting builder | Backend | Domain helper | Builds a greeting from the current time and pending tasks |
| Pydantic schemas | Backend | Request and response models | Validates message and task data and shapes task responses |
| Repository | Backend | Data access layer | Implements message and task queries and mutations |
| SQLAlchemy models | Persistence | ORM models | Maps messages and tasks to database tables |
| Database session and engine | Persistence | Database configuration | Creates SQLite connections and request-scoped sessions |
| SQLite database | Persistence | Database | Stores messages and tasks locally |
