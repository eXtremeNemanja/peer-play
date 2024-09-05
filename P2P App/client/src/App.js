import './App.css';
import VideoUploader from './Video/VideoUploader/VideoUploader.tsx';
import MenuBar from './Menu/MenuBar.tsx';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import LoginPage from './Auth/Login/LoginPage.tsx';
import RegisterPage from './Auth/Register/RegisterPage.tsx';
import VideoRetriever from './Video/VideoRetriever/VideoRetriever.tsx';
import VideoPurchase from './Video/VideoPurchase/VideoPurchase.tsx';

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
            <Route path='/login' element={<LoginPage/>}/>
            <Route path='/register' element={<RegisterPage/>}/>
            <Route path='/retrieve' element={<VideoRetriever/>}/>
            <Route path='/purchase' element={<VideoPurchase/>}/>
        </Routes>
    </Router>
);
}

export default App;
