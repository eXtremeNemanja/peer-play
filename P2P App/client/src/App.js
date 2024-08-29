import logo from './logo.svg';
import './App.css';
import VideoUploader from './VideoUploader/VideoUploader.tsx';

function App() {
  return (
    <div className="App">
        <header className="App-header">
            <h1>IPFS with React</h1>
            <VideoUploader />
        </header>
    </div>
);
}

export default App;
