import React from 'react';
import {Link} from 'react-router-dom'
import { CiLogin } from "react-icons/ci";
import './MenuBar.css';  // Import the CSS for styling

const MenuBar = () => {
    return (
        <div className='menu'>
            <Link to='/'> <img src="/PeerPlay_logo.png" alt="PeerPlay Logo" className="logo" /> </Link>
            {/* <Link to="/video">Upload video</Link> */}
            <div className='menu-options'>
                <Link to="/login" className='menu-option'><CiLogin/></Link>
            </div>
        </div>
    );
};

export default MenuBar;
