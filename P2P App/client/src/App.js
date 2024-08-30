import './App.css';
import VideoUploader from './VideoUploader/VideoUploader.tsx';
import MenuBar from './Menu/MenuBar.tsx';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';

function App() {
  return (
    <Router>
        <MenuBar/>
        <Routes>
            <Route path='/video' element={
                    <div className="App">
                        <header className="App-header">
                            <h1>IPFS with React</h1>
                            <VideoUploader />
                        </header>
                    </div>} />
        </Routes>
    </Router>
);
}

export default App;
